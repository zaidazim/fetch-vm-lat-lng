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

      // Smart Address Construction
      let address = '';

      // Check for specific columns (case-insensitive)
      const getCol = (name: string) => {
        const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
        return key ? row[key] : '';
      };

      const vmName = getCol('name') || getCol('vm name') || getCol('vmname');
      const addrPart = getCol('address') || getCol('street');
      const cityPart = getCol('city');
      const statePart = getCol('state');
      const zipPart = getCol('zip') || getCol('postal code');

      if (addrPart || cityPart || statePart || vmName) {
        // Construct from parts
        // Priorities: VM Name > Address > City > State > Zip
        address = [vmName, addrPart, cityPart, statePart, zipPart].filter(Boolean).join(', ');
      } else {
        // Fallback: Use the first column
        address = Object.values(row)[0] as string;
      }

      if (address) {
        try {
          // Retry logic for 429 (Rate Limits)
          const maxRetries = 3;
          let retryCount = 0;
          let success = false;
          let finalResult = null;

          while (retryCount <= maxRetries && !success) {
            if (retryCount > 0) {
              // Exponential backoff or default
              const delay = 2000 * Math.pow(2, retryCount - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else if (i > 0) {
              // Standard pacing
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const payload = {
              address, // Use the combined string as primary 'address'
              vmName,
              street: addrPart,
              city: cityPart,
              state: statePart,
              postal: zipPart
            };

            const response = await fetch('/api/geocode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (response.status === 429) {
              const retryAfter = response.headers.get('Retry-After');
              if (retryAfter) {
                const waitSeconds = parseInt(retryAfter, 10);
                if (!isNaN(waitSeconds)) {
                  await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                  // Don't increment retryCount if we waited explicitly? Or do? 
                  // Let's just continue loop.
                  continue;
                }
              }
              retryCount++;
              continue;
            }

            finalResult = result;
            success = response.ok;
            // If not OK (e.g. 404, 500), we don't retry locally anymore, we accept the result
            // because the backend now tries multiple strategies.
            break;
          }

          if (success && finalResult) {
            processedData[i] = {
              ...row,
              Latitude: finalResult.latitude,
              Longitude: finalResult.longitude,
              'Matched Place': finalResult.placeName,
              Status: finalResult.status || 'Success',
              Confidence: finalResult.confidence // Optional display
            };
          } else {
            processedData[i] = {
              ...row,
              Status: finalResult?.status || `Error: ${finalResult?.error || 'Unknown error'}`,
            };
          }
        } catch (error) {
          console.error(error);
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
