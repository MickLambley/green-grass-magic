/// <reference types="vite/client" />

// Manually declare google namespace since @types/google.maps
// dotted package name has resolution issues
declare namespace google {
  namespace maps {
    class Map {
      constructor(element: HTMLElement, opts?: any);
      setCenter(latlng: any): void;
      fitBounds(bounds: any): void;
      addListener(event: string, handler: Function): any;
      getZoom(): number;
    }
    class Marker {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setPosition(latlng: any): void;
      addListener(event: string, handler: Function): any;
      getPosition(): LatLng;
    }
    class Circle {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setCenter(latlng: any): void;
      setRadius(radius: number): void;
      getBounds(): LatLngBounds;
    }
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(point: LatLng): LatLngBounds;
      getCenter(): LatLng;
    }
    class Geocoder {
      geocode(request: any, callback?: (results: any[], status: string) => void): Promise<any>;
    }
    class Polygon {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      getPath(): any;
      setPaths(paths: any): void;
      addListener(event: string, handler: Function): any;
    }
    class InfoWindow {
      constructor(opts?: any);
      open(opts?: any): void;
      close(): void;
      setContent(content: string | HTMLElement): void;
    }
    namespace places {
      class Autocomplete {
        constructor(input: HTMLInputElement, opts?: any);
        addListener(event: string, handler: Function): any;
        getPlace(): any;
        setBounds(bounds: any): void;
      }
      class AutocompleteService {
        getPlacePredictions(request: any, callback?: (results: any[], status: string) => void): Promise<any>;
      }
    }
    namespace drawing {
      class DrawingManager {
        constructor(opts?: any);
        setMap(map: Map | null): void;
        setDrawingMode(mode: any): void;
        addListener(event: string, handler: Function): any;
      }
      const OverlayType: {
        POLYGON: string;
        MARKER: string;
        [key: string]: string;
      };
    }
    namespace geometry {
      namespace spherical {
        function computeArea(path: any): number;
        function computeDistanceBetween(from: LatLng, to: LatLng): number;
      }
    }
    namespace event {
      function addListener(instance: any, event: string, handler: Function): any;
      function removeListener(listener: any): void;
      function clearInstanceListeners(instance: any): void;
    }
    const GeocoderStatus: {
      OK: string;
      [key: string]: string;
    };
    const SymbolPath: {
      CIRCLE: number;
      [key: string]: number;
    };
    const ControlPosition: {
      TOP_CENTER: number;
      TOP_LEFT: number;
      TOP_RIGHT: number;
      BOTTOM_CENTER: number;
      [key: string]: number;
    };
    const MapTypeId: {
      ROADMAP: string;
      SATELLITE: string;
      HYBRID: string;
      TERRAIN: string;
      [key: string]: string;
    };
  }
}
