'use client';

import React, { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import ResultsTable from '@/components/ResultsTable';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDataLoaded = (loadedData: any[]) => {
    setData(loadedData);
  };

  const processAddresses = async () => {
    setIsProcessing(true);
    setProgress(0);
    const processedData = [...data];
    const total = processedData.length;

    for (let i = 0; i < total; i++) {
      const row = processedData[i];
      // Assuming the address column is named 'Address' or 'address'
      // You might want to make this selectable or smarter
      const address = row.Address || row.address || Object.values(row)[0]; // Fallback to first column

      if (address) {
        try {
          // Rate Limiting: Wait 1 second before each request (except the first one)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const response = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
          });
          const result = await response.json();

          if (response.ok) {
            processedData[i] = {
              ...row,
              Latitude: result.latitude,
              Longitude: result.longitude,
              'Matched Place': result.placeName,
              Status: 'Success',
            };
          } else {
            processedData[i] = {
              ...row,
              Status: `Error: ${result.error}`,
            };
          }
        } catch (error) {
          processedData[i] = {
            ...row,
            Status: 'Error: Network/Server',
          };
        }
      } else {
        processedData[i] = {
          ...row,
          Status: 'Skipped: No Address',
        };
      }

      // Update progress
      setProgress(Math.round(((i + 1) / total) * 100));
      // Update state periodically to show progress (optional, but good for UX)
      if (i % 5 === 0 || i === total - 1) {
        setData([...processedData]);
      }
    }

    setIsProcessing(false);
    setData(processedData);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            VM Address Geocoder
          </h1>
          <p className="text-lg text-gray-600">
            Upload a CSV file with addresses to fetch their Latitude and Longitude.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <FileUpload onDataLoaded={handleDataLoaded} />

          {data.length > 0 && !isProcessing && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={processAddresses}
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Process {data.length} Addresses
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="mt-6 text-center">
              <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
                <Loader2 className="animate-spin" />
                <span className="font-semibold">Processing... {progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        <ResultsTable data={data} />
      </div>
    </main>
  );
}
