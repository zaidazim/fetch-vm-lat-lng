import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const encodedAddress = encodeURIComponent(address);
    // Nominatim API endpoint
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        // Nominatim requires a User-Agent identifying the application
        'User-Agent': 'VM-Address-Geocoder/1.0 (internal-tool)',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return NextResponse.json({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        placeName: result.display_name,
      });
    } else {
      return NextResponse.json(
        { error: 'No results found' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Geocoding error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
