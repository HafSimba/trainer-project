'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
    BarcodeFormat,
    BrowserMultiFormatReader,
    DecodeHintType,
    NotFoundException,
} from '@zxing/library';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

const SCAN_INTERVAL_MS = 260;
const SAME_BARCODE_COOLDOWN_MS = 2500;
const ROI_WIDTH_RATIO = 0.78;
const ROI_HEIGHT_RATIO = 0.3;

type ScanEngine = 'native' | 'zxing';

type BarcodeDetection = {
    rawValue?: string;
};

type BarcodeDetectorLike = {
    detect: (source: CanvasImageSource) => Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type BarcodeDetectorGlobal = {
    BarcodeDetector?: BarcodeDetectorConstructor & {
        getSupportedFormats?: () => Promise<string[]>;
    };
};

interface ProductInfo {
    food_id?: string;
    product_name: string;
    nutriments: {
        'energy-kcal_100g'?: number;
        proteins_100g?: number;
        carbohydrates_100g?: number;
        fat_100g?: number;
    };
    serving_options?: Array<{
        serving_id: string;
        label: string;
        number_of_units: number;
        measurement_description?: string;
        metric_serving_amount?: number;
        metric_serving_unit?: string;
        is_default: boolean;
        nutriments: {
            calories: number;
            proteins_g: number;
            carbohydrates_g: number;
            fats_g: number;
        };
    }>;
    brands?: string;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return 'Errore durante il recupero del prodotto';
}

function parseJsonSafe<T>(text: string): T | null {
    if (!text) return null;

    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

function normalizeDetectedBarcode(rawValue: string): string {
    const normalized = rawValue.replace(/\D/g, '');
    return normalized || rawValue.trim();
}

function isExpectedNoCodeError(error: unknown): boolean {
    if (error instanceof NotFoundException) {
        return true;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    return /not found|no multi/i.test(error.message);
}

export function BarcodeScanner({
    onProductFound
}: {
    onProductFound: (product: ProductInfo) => void
}) {
    const webcamRef = useRef<Webcam>(null);
    const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const nativeDetectorRef = useRef<BarcodeDetectorLike | null>(null);
    const decodeInProgressRef = useRef(false);
    const lastDetectedBarcodeRef = useRef<{ value: string; timestamp: number } | null>(null);

    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scanEngine, setScanEngine] = useState<ScanEngine>('zxing');

    useEffect(() => {
        const hints = new Map<DecodeHintType, unknown>([
            [DecodeHintType.POSSIBLE_FORMATS, [
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
            ]],
            [DecodeHintType.TRY_HARDER, true],
        ]);

        codeReaderRef.current = new BrowserMultiFormatReader(hints, SCAN_INTERVAL_MS);

        const setupNativeDetector = async () => {
            const detectorGlobal = (globalThis as unknown as BarcodeDetectorGlobal).BarcodeDetector;

            if (!detectorGlobal) {
                nativeDetectorRef.current = null;
                setScanEngine('zxing');
                return;
            }

            try {
                const preferredFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
                const supportedFormats = typeof detectorGlobal.getSupportedFormats === 'function'
                    ? await detectorGlobal.getSupportedFormats()
                    : preferredFormats;
                const formats = preferredFormats.filter((format) => supportedFormats.includes(format));

                nativeDetectorRef.current = new detectorGlobal({ formats: formats.length ? formats : preferredFormats });
                setScanEngine('native');
            } catch {
                nativeDetectorRef.current = null;
                setScanEngine('zxing');
            }
        };

        void setupNativeDetector();

        return () => {
            codeReaderRef.current?.reset();
            codeReaderRef.current = null;
            nativeDetectorRef.current = null;
            roiCanvasRef.current = null;
        };
    }, []);

    const shouldSkipBarcode = useCallback((barcode: string): boolean => {
        const lastDetected = lastDetectedBarcodeRef.current;
        if (!lastDetected) {
            return false;
        }

        return lastDetected.value === barcode && Date.now() - lastDetected.timestamp < SAME_BARCODE_COOLDOWN_MS;
    }, []);

    const rememberBarcode = useCallback((barcode: string) => {
        lastDetectedBarcodeRef.current = {
            value: barcode,
            timestamp: Date.now(),
        };
    }, []);

    const captureRoiFrame = useCallback((video: HTMLVideoElement): HTMLCanvasElement | null => {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (!sourceWidth || !sourceHeight) {
            return null;
        }

        const roiWidth = Math.max(220, Math.floor(sourceWidth * ROI_WIDTH_RATIO));
        const roiHeight = Math.max(90, Math.floor(sourceHeight * ROI_HEIGHT_RATIO));
        const sourceX = Math.floor((sourceWidth - roiWidth) / 2);
        const sourceY = Math.floor((sourceHeight - roiHeight) / 2);

        const canvas = roiCanvasRef.current ?? document.createElement('canvas');
        roiCanvasRef.current = canvas;
        canvas.width = roiWidth;
        canvas.height = roiHeight;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return null;
        }

        context.drawImage(video, sourceX, sourceY, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);
        return canvas;
    }, []);

    const detectWithNative = useCallback(async (frame: HTMLCanvasElement): Promise<string | null> => {
        const detector = nativeDetectorRef.current;
        if (!detector) {
            return null;
        }

        const detections = await detector.detect(frame);
        const detected = detections.find((item) => typeof item.rawValue === 'string' && item.rawValue.trim());

        return detected?.rawValue ? normalizeDetectedBarcode(detected.rawValue) : null;
    }, []);

    const detectWithZxing = useCallback(async (frame: HTMLCanvasElement): Promise<string | null> => {
        const reader = codeReaderRef.current;
        if (!reader) {
            return null;
        }

        const snapshot = frame.toDataURL('image/jpeg', 0.65);
        const result = await reader.decodeFromImage(undefined, snapshot);
        const rawValue = result.getText()?.trim() || '';

        return rawValue ? normalizeDetectedBarcode(rawValue) : null;
    }, []);

    const fetchProductData = useCallback(async (barcode: string) => {
        setLoading(true);
        setScanning(false);
        setError(null);
        try {
            const res = await fetch(`/api/fatsecret/barcode?barcode=${encodeURIComponent(barcode)}`);
            const rawText = await res.text();
            const data = parseJsonSafe<{ product?: ProductInfo; error?: string }>(rawText);

            if (!res.ok || !data?.product) {
                throw new Error(data?.error || `Prodotto non trovato su FatSecret (HTTP ${res.status})`);
            }

            onProductFound(data.product);
        } catch (error: unknown) {
            setError(getErrorMessage(error));
            lastDetectedBarcodeRef.current = null;
            setScanning(true);
        } finally {
            setLoading(false);
        }
    }, [onProductFound]);

    const captureAndScan = useCallback(async () => {
        if (!scanning || loading || decodeInProgressRef.current || !webcamRef.current?.video) {
            return;
        }

        const video = webcamRef.current.video;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }

        const roiFrame = captureRoiFrame(video);
        if (!roiFrame) {
            return;
        }

        decodeInProgressRef.current = true;

        let barcode: string | null = null;

        try {
            if (nativeDetectorRef.current) {
                try {
                    barcode = await detectWithNative(roiFrame);
                } catch {
                    barcode = null;
                }
            }

            if (!barcode) {
                try {
                    barcode = await detectWithZxing(roiFrame);
                } catch (error) {
                    if (!isExpectedNoCodeError(error)) {
                        console.error(error);
                    }
                }
            }

            if (!barcode || shouldSkipBarcode(barcode)) {
                return;
            }

            rememberBarcode(barcode);
            await fetchProductData(barcode);
        } finally {
            decodeInProgressRef.current = false;
        }
    }, [
        captureRoiFrame,
        detectWithNative,
        detectWithZxing,
        fetchProductData,
        loading,
        rememberBarcode,
        scanning,
        shouldSkipBarcode,
    ]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        if (scanning && !loading) {
            interval = setInterval(() => {
                void captureAndScan();
            }, SCAN_INTERVAL_MS);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [scanning, loading, captureAndScan]);

    return (
        <Card className="w-full max-w-sm mx-auto overflow-hidden">
            <CardHeader>
                <CardTitle className="text-center">Scanner Alimenti</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
                <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center">
                    {scanning && !loading ? (
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.7}
                            videoConstraints={{
                                facingMode: { ideal: 'environment' },
                                width: { ideal: 960 },
                                height: { ideal: 720 },
                            }}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="text-white text-sm">
                            {loading ? (
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                            ) : (
                                "Scanner disattivato"
                            )}
                        </div>
                    )}

                    {scanning && (
                        <>
                            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-[11px] text-white pointer-events-none">
                                Allinea il barcode dentro il riquadro
                            </div>
                            <div className="absolute left-1/2 top-1/2 h-[30%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-blue-400 pointer-events-none" />
                            <div className="absolute inset-0 border border-blue-300/30 pointer-events-none" />
                        </>
                    )}
                </div>

                <div className="text-center space-y-1">
                    <p className="text-xs text-gray-500">Mantieni il telefono fermo e il codice ben illuminato.</p>
                    <p className="text-[11px] text-gray-400">
                        Motore: {scanEngine === 'native' ? 'BarcodeDetector (rapido)' : 'ZXing (fallback)'}
                    </p>
                </div>

                {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                )}

                <Button
                    variant={scanning ? "destructive" : "default"}
                    onClick={() => {
                        setScanning((previousValue) => {
                            const nextValue = !previousValue;
                            if (nextValue) {
                                lastDetectedBarcodeRef.current = null;
                            }
                            return nextValue;
                        });
                        setError(null);
                    }}
                    className="w-full"
                >
                    {scanning ? 'Ferma Scanner' : 'Avvia Scanner'}
                </Button>
            </CardContent>
        </Card>
    );
}
