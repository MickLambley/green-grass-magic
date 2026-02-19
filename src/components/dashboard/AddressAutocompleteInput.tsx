import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import { Loader2, MapPin } from "lucide-react";

interface AddressAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (address: {
    street_address: string;
    city: string;
    state: string;
    postal_code: string;
  }) => void;
  placeholder?: string;
}

const AddressAutocompleteInput = ({
  value,
  onChange,
  onSelectAddress,
  placeholder = "Start typing your address...",
}: AddressAutocompleteInputProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { suggestions, loading, searchAddresses, clearSuggestions } = useAddressAutocomplete();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    searchAddresses(newValue);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (suggestion: {
    street_address: string;
    city: string;
    state: string;
    postal_code: string;
  }) => {
    onChange(suggestion.street_address);
    onSelectAddress(suggestion);
    setShowSuggestions(false);
    clearSuggestions();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectSuggestion(suggestion);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-start gap-2 border-b last:border-b-0"
            >
              <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{suggestion.street_address}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {suggestion.city}, {suggestion.state} {suggestion.postal_code}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocompleteInput;
