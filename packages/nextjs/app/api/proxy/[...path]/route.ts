import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();

  const url = `https://api.1inch.dev/swap/v6.0/${path}${queryString ? `?${queryString}` : ""}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer pIEkOQOA0KzMSEKjD7LtdNxKgVDa0BJH",
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("API proxy error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
