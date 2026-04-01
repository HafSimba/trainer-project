'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
    BarcodeFormat,
    BrowserMultiFormatReader,
    DecodeHintType,
    NotFoundException,
} from '@zxing/library';
import { parseJsonSafe } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

const SCAN_INTERVAL_MS = 260;
const SAME_BARCODE_COOLDOWN_MS = 2500;
const FAILED_BARCODE_COOLDOWN_MS = 12000;
const ROI_WIDTH_RATIO = 0.78;
const ROI_HEIGHT_RATIO = 0.3;

type ScanEngine = 'native' | 'zxing';
type CameraState = 'booting' | 'ready' | 'denied' | 'error';

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
    const failedBarcodeCooldownRef = useRef<Map<string, number>>(new Map());
    const requestInFlightRef = useRef<string | null>(null);

    const [scanning, setScanning] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scanEngine, setScanEngine] = useState<ScanEngine>('zxing');
    const [cameraState, setCameraState] = useState<CameraState>('booting');

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

    const isBarcodeInErrorCooldown = useCallback((barcode: string): boolean => {
        const until = failedBarcodeCooldownRef.current.get(barcode) ?? 0;
        return until > Date.now();
    }, []);

    const setBarcodeErrorCooldown = useCallback((barcode: string) => {
        failedBarcodeCooldownRef.current.set(barcode, Date.now() + FAILED_BARCODE_COOLDOWN_MS);
    }, []);

    const clearBarcodeErrorCooldown = useCallback((barcode: string) => {
        failedBarcodeCooldownRef.current.delete(barcode);
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
        if (requestInFlightRef.current === barcode) {
            return;
        }

        requestInFlightRef.current = barcode;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/fatsecret/barcode?barcode=${encodeURIComponent(barcode)}`);
            const rawText = await res.text();

            const data = parseJsonSafe<{ product?: ProductInfo; error?: string }>(rawText);
            if (!data) {
                throw new Error(`Risposta non valida dal server (HTTP ${res.status})`);
            }

            if (!res.ok || (!data.product && data.error)) {
                throw new Error(data.error || `Prodotto non trovato (HTTP ${res.status})`);
            }

            if (!data.product) {
                throw new Error(`Prodotto non trovato o dati mancanti.`);
            }

            clearBarcodeErrorCooldown(barcode);
            onProductFound(data.product);
        } catch (error: unknown) {
            setError(getErrorMessage(error));
            setBarcodeErrorCooldown(barcode);
        } finally {
            requestInFlightRef.current = null;
            setLoading(false);
        }
    }, [clearBarcodeErrorCooldown, onProductFound, setBarcodeErrorCooldown]);

    const startScanner = useCallback(() => {
        lastDetectedBarcodeRef.current = null;
        failedBarcodeCooldownRef.current.clear();
        setError(null);
        setLoading(false);
        setCameraState('booting');
        setScanning(true);
    }, []);

    const stopScanner = useCallback(() => {
        setScanning(false);
        setLoading(false);
        setError(null);
    }, []);

    const handleUserMedia = useCallback(() => {
        setCameraState('ready');
        setError(null);
    }, []);

    const handleUserMediaError = useCallback((mediaError: string | DOMException) => {
        const errorName = typeof mediaError === 'string' ? mediaError : mediaError?.name || '';
        const denied = /NotAllowedError|PermissionDeniedError|denied/i.test(errorName);

        setCameraState(denied ? 'denied' : 'error');
        setScanning(false);
        setLoading(false);
        setError(
            denied
                ? 'Permesso fotocamera negato. Consenti l\'accesso alla camera e premi Riprova.'
                : 'Impossibile accedere alla fotocamera. Verifica permessi e disponibilita del dispositivo.'
        );
    }, []);

    const captureAndScan = useCallback(async () => {
        if (cameraState !== 'ready' || !scanning || loading || decodeInProgressRef.current || !webcamRef.current?.video) {
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

            if (!barcode || shouldSkipBarcode(barcode) || isBarcodeInErrorCooldown(barcode)) {
                return;
            }

            rememberBarcode(barcode);
            await fetchProductData(barcode);
        } finally {
            decodeInProgressRef.current = false;
        }
    }, [
        captureRoiFrame,
        cameraState,
        detectWithNative,
        detectWithZxing,
        fetchProductData,
        isBarcodeInErrorCooldown,
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
        <Card className="mx-auto w-full max-w-sm overflow-hidden border border-border/75 bg-card shadow-none">
            <CardHeader className="pb-2">
                <CardTitle className="text-center text-base">Scanner Alimenti</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
                <div className="relative flex w-full aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-black">
                    {scanning ? (
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
                            onUserMedia={handleUserMedia}
                            onUserMediaError={handleUserMediaError}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="px-4 text-center text-sm text-white/90">
                            Scanner in pausa
                        </div>
                    )}

                    {scanning && cameraState !== 'ready' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 px-4 text-center text-white">
                            <Loader2 className="h-7 w-7 animate-spin" />
                            <p className="text-xs">Attivazione fotocamera in corso...</p>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
                            <Loader2 className="h-7 w-7 animate-spin text-white" />
                        </div>
                    )}

                    {scanning && cameraState === 'ready' && (
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
                    <p className="text-xs text-muted-foreground">Mantieni il telefono fermo e il codice ben illuminato.</p>
                    <p className="text-[11px] text-muted-foreground/85">
                        Motore: {scanEngine === 'native' ? 'BarcodeDetector (rapido)' : 'ZXing (fallback)'}
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-center text-destructive">{error}</p>
                )}

                <div className="flex w-full gap-2">
                    <Button variant={scanning ? 'destructive' : 'default'} onClick={scanning ? stopScanner : startScanner} className="flex-1">
                        {scanning ? 'Ferma scanner' : 'Avvia scanner'}
                    </Button>
                    {cameraState !== 'ready' && (
                        <Button variant="outline" onClick={startScanner} className="flex-1">
                            Riprova
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
