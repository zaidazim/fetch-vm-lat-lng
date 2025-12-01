'use client';

import React, { useCallback } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';

interface FileUploadProps {
    onDataLoaded: (data: any[]) => void;
}

export default function FileUpload({ onDataLoaded }: FileUploadProps) {
    const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                onDataLoaded(results.data);
            },
            error: (error) => {
                console.error('Error parsing CSV:', error);
                alert('Error parsing CSV file');
            },
        });
    }, [onDataLoaded]);

    return (
        <div className="w-full max-w-xl mx-auto p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors bg-white shadow-sm">
            <label className="flex flex-col items-center justify-center cursor-pointer">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-gray-400" />
                    <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mb-2">CSV files only</p>
                    <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded text-center">
                        <p className="font-medium">Format:</p>
                        <p>Columns: <code className="bg-gray-200 px-1 rounded">Address</code>, <code className="bg-gray-200 px-1 rounded">City</code>, <code className="bg-gray-200 px-1 rounded">State</code>, <code className="bg-gray-200 px-1 rounded">Zip</code></p>
                        <p className="text-[10px] mt-1">(Zip/State are optional)</p>
                        <p>or first column will be used</p>
                    </div>
                </div>
                <input
                    type="file"
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileUpload}
                />
            </label>
        </div>
    );
}
