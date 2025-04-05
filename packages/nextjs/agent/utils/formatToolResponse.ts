export function formatToolResponse(response: any): string {
  try {
    const data = typeof response === 'string' ? JSON.parse(response) : response;

    function formatValue(value: any): string {
      if (value === null || value === undefined) return 'null';
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return JSON.stringify(value);
        }
        // For nested objects, format each property
        return Object.entries(value)
          .map(([k, v]) => `${k}: ${formatValue(v)}`)
          .join('\n');
      }
      return String(value);
    }

    return Object.entries(data)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join('\n');
  } catch (_error) {
    return String(response);
  }
}
