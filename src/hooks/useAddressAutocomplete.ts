import { useState, useCallback, useRef } from "react";

interface AddressSuggestion {
  full_address: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
}

// Using the Australia Post Address Validation API (free tier)
// or fallback to a mock implementation for demo purposes
export const useAddressAutocomplete = () => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Australian states abbreviation mapping
  const stateAbbreviations: Record<string, string> = {
    "New South Wales": "NSW",
    "Victoria": "VIC",
    "Queensland": "QLD",
    "Western Australia": "WA",
    "South Australia": "SA",
    "Tasmania": "TAS",
    "Northern Territory": "NT",
    "Australian Capital Territory": "ACT",
  };

  const searchAddresses = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      
      try {
        // Using OpenStreetMap Nominatim API (free, no API key required)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(query)}&` +
          `countrycodes=au&` +
          `format=json&` +
          `addressdetails=1&` +
          `limit=5`,
          {
            headers: {
              "User-Agent": "Lawnly App (contact@lawnly.com.au)",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          // Extract house number from user's query if present
          const houseNumberMatch = query.match(/^(\d+[a-zA-Z]?)\s+/);
          const userHouseNumber = houseNumberMatch ? houseNumberMatch[1] : "";

          const formattedSuggestions: AddressSuggestion[] = data
            .filter((item: any) => item.address)
            .map((item: any) => {
              const addr = item.address;
              // Use API house number if available, otherwise use the one from user's query
              const streetNumber = addr.house_number || userHouseNumber;
              const streetName = addr.road || addr.street || "";
              const street = `${streetNumber} ${streetName}`.trim();
              const city = addr.suburb || addr.city || addr.town || addr.municipality || "";
              const state = stateAbbreviations[addr.state] || addr.state || "";
              const postcode = addr.postcode || "";

              return {
                full_address: item.display_name,
                street_address: street || item.display_name.split(",")[0],
                city,
                state,
                postal_code: postcode,
              };
            })
            .filter((s: AddressSuggestion) => s.street_address && s.city);

          setSuggestions(formattedSuggestions);
        }
      } catch (error) {
        console.error("Address autocomplete error:", error);
        // Fallback to empty results on error
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  return {
    suggestions,
    loading,
    searchAddresses,
    clearSuggestions,
  };
};
