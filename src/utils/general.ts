export function extractLinkedInPublicIdentifier(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // Check if it's a LinkedIn URL
      if (!urlObj.hostname.includes('linkedin.com')) {
        return null;
      }

      // Extract pathname and remove leading/trailing slashes
      let pathname = urlObj.pathname.replace(/^\/+|\/+$/g, '');

      // Handle /in/ pattern for personal profiles
      if (pathname.startsWith('in/')) {
        const identifier = pathname.substring(3); // Remove 'in/' prefix
        return identifier || null;
      }

      // Handle /company/ pattern for company profiles
      if (pathname.startsWith('company/')) {
        const identifier = pathname.substring(8); // Remove 'company/' prefix
        return identifier || null;
      }

      return null;
    } catch {
      return null;
    }
  }