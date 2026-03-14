'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

interface ProductInfo {
    product_name: string;
    nutriments: {
        energy_kcal_100g?: number;
        proteins_100g?: number;
        carbohydrates_100g?: number;
        fat_100g?: number;
    };
}

export function BarcodeScanner({
    onProductFound
}: {
    onProductFound: (product: ProductInfo) => void
}) {
    const webcamRef = useRef<Webcam>(null);
    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchProductData = async (barcode: string) => {
        setLoading(true);
        setScanning(false);
        setError(null);
        try {
            const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}`);
            if (!res.ok) throw new Error('Product not found in Open Food Facts');

            const data = await res.json();
            if (data.status === 1 && data.product) {
                onProductFound(data.product);
            } else {
                throw new Error('Product data incomplete');
            }
        } catch (err: any) {
            setError(err.message || 'Error fetching product');
            setScanning(true); // resume scanning
        } finally {
            setLoading(false);
        }
    };

    const captureAndScan = useCallback(async () => {
        if (!scanning || loading || !webcamRef.current) return;

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) return;

        try {
            const codeReader = new BrowserMultiFormatReader();
            const result = await codeReader.decodeFromImage(undefined, imageSrc);

            if (result && result.getText()) {
                const barcode = result.getText();
                console.log("Barcode found:", barcode);
                await fetchProductData(barcode);
            }
        } catch (err) {
            // NotFoundException is expected, it just means no rect found.
            if (!(err instanceof NotFoundException)) {
                console.error(err);
            }
        }
    }, [scanning, loading]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (scanning && !loading) {
            interval = setInterval(() => {
                captureAndScan();
            }, 500); // 2 frames per second scanning
        }
        return () => {
            if (interval) clearInterval(interval);
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
                            videoConstraints={{
                                facingMode: "environment" // Use back camera on mobile
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
                        <div className="absolute inset-0 border-2 border-dashed border-blue-500/50 m-8 rounded pointer-events-none" />
                    )}
                </div>

                {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                )}

                <Button
                    variant={scanning ? "destructive" : "default"}
                    onClick={() => {
                        setScanning(!scanning);
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
