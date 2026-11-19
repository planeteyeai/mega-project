import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

interface LeafletDrawControlProps {
  drawingEnabled: boolean;
  onShapeCreated: (shape: GeoJSON.Feature) => void;
  onShapeEdited: (shape: GeoJSON.Feature) => void;
  onShapeDeleted: (shapeId: string) => void;
  drawnShapes: GeoJSON.Feature[];
}

const POLY_STYLE = {
  color: '#22c55e',
  fillColor: '#22c55e',
  fillOpacity: 0.25,
  weight: 3,
};

/**
 * Leaflet.Draw on the same `L` as react-leaflet.
 * - Callbacks via refs (no toolbar thrash)
 * - Does not clear the feature group while a polygon is mid-draw
 * - allowIntersection true so clicks are not rejected as “invalid”
 */
const LeafletDrawControl: React.FC<LeafletDrawControlProps> = ({
  drawingEnabled,
  onShapeCreated,
  onShapeEdited,
  onShapeDeleted,
  drawnShapes,
}) => {
  const map = useMap();
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const polygonDrawerRef = useRef<any>(null);
  const drawingInProgressRef = useRef(false);
  const onCreatedRef = useRef(onShapeCreated);
  const onEditedRef = useRef(onShapeEdited);
  const onDeletedRef = useRef(onShapeDeleted);

  onCreatedRef.current = onShapeCreated;
  onEditedRef.current = onShapeEdited;
  onDeletedRef.current = onShapeDeleted;

  useEffect(() => {
    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }
    const fg = featureGroupRef.current;

    const handleDrawStart = () => {
      drawingInProgressRef.current = true;
    };
    const handleDrawStop = () => {
      drawingInProgressRef.current = false;
    };

    const handleDrawCreated = (e: any) => {
      drawingInProgressRef.current = false;
      const layer = e.layer;
      const geoJSON = layer.toGeoJSON() as GeoJSON.Feature;
      const id = `draw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      (geoJSON as any).id = id;
      geoJSON.properties = {
        ...(geoJSON.properties || {}),
        id,
        name: geoJSON.properties?.name || 'Drawn plot',
      };
      (layer as any)._drawId = id;
      fg.addLayer(layer);
      onCreatedRef.current(geoJSON);

      // Re-arm polygon tool without tearing down the control (avoids lag / lost vertices)
      window.setTimeout(() => {
        if (!polygonDrawerRef.current) return;
        try {
          polygonDrawerRef.current.enable();
          drawingInProgressRef.current = true;
        } catch {
          /* ignore */
        }
      }, 50);
    };

    const handleDrawEdited = (e: any) => {
      e.layers.eachLayer((layer: L.Layer) => {
        const geoJSON = (layer as any).toGeoJSON() as GeoJSON.Feature;
        const id =
          (layer as any)._drawId || geoJSON.properties?.id || (geoJSON as any).id;
        if (id) {
          (geoJSON as any).id = id;
          geoJSON.properties = { ...(geoJSON.properties || {}), id };
        }
        onEditedRef.current(geoJSON);
      });
    };

    const handleDrawDeleted = (e: any) => {
      e.layers.eachLayer((layer: L.Layer) => {
        const geoJSON = (layer as any).toGeoJSON?.() as GeoJSON.Feature | undefined;
        const id =
          (layer as any)._drawId ||
          geoJSON?.properties?.id ||
          (geoJSON as any)?.id;
        if (id) onDeletedRef.current(String(id));
      });
    };

    const createdEvt = (L as any).Draw?.Event?.CREATED || 'draw:created';
    const editedEvt = (L as any).Draw?.Event?.EDITED || 'draw:edited';
    const deletedEvt = (L as any).Draw?.Event?.DELETED || 'draw:deleted';
    const startEvt = (L as any).Draw?.Event?.DRAWSTART || 'draw:drawstart';
    const stopEvt = (L as any).Draw?.Event?.DRAWSTOP || 'draw:drawstop';

    map.on(createdEvt, handleDrawCreated);
    map.on(editedEvt, handleDrawEdited);
    map.on(deletedEvt, handleDrawDeleted);
    map.on(startEvt, handleDrawStart);
    map.on(stopEvt, handleDrawStop);

    return () => {
      map.off(createdEvt, handleDrawCreated);
      map.off(editedEvt, handleDrawEdited);
      map.off(deletedEvt, handleDrawDeleted);
      map.off(startEvt, handleDrawStart);
      map.off(stopEvt, handleDrawStop);
    };
  }, [map]);

  useEffect(() => {
    const DrawControlCtor = (L as any).Control?.Draw;
    const PolygonDrawer = (L as any).Draw?.Polygon;
    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }
    const fg = featureGroupRef.current;

    const tearDown = () => {
      try {
        polygonDrawerRef.current?.disable?.();
      } catch {
        /* ignore */
      }
      polygonDrawerRef.current = null;
      drawingInProgressRef.current = false;
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
        drawControlRef.current = null;
      }
      map.getContainer().style.cursor = '';
    };

    if (!drawingEnabled) {
      tearDown();
      return;
    }

    if (!DrawControlCtor) {
      console.error('leaflet-draw missing: L.Control.Draw is undefined');
      return;
    }

    if (!drawControlRef.current) {
      const drawControl = new DrawControlCtor({
        position: 'topleft',
        draw: {
          polygon: {
            // Allow complex rings; rejecting intersections caused early cancel / lag
            allowIntersection: true,
            showArea: true,
            metric: true,
            // Don't finish just because we hit the Leaflet 3-point minimum
            shapeOptions: { ...POLY_STYLE },
            // Keep guideline snappy
            guidelineDistance: 20,
            maxPoints: 0, // 0 = unlimited in leaflet-draw
          },
          polyline: false,
          rectangle: false,
          circle: false,
          marker: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: fg,
          remove: true,
        },
      });
      drawControlRef.current = drawControl;
      map.addControl(drawControl);
    }

    if (PolygonDrawer && !polygonDrawerRef.current) {
      const drawer = new PolygonDrawer(map, {
        allowIntersection: true,
        showArea: true,
        metric: true,
        shapeOptions: { ...POLY_STYLE },
        guidelineDistance: 20,
        maxPoints: 0,
      });
      drawer.enable();
      polygonDrawerRef.current = drawer;
      drawingInProgressRef.current = true;
      map.getContainer().style.cursor = 'crosshair';
    }

    return () => {
      tearDown();
    };
  }, [map, drawingEnabled]);

  // Sync finished shapes only when not mid-draw (clearing mid-draw drops vertices)
  useEffect(() => {
    if (!featureGroupRef.current) return;
    if (drawingInProgressRef.current) return;

    const fg = featureGroupRef.current;
    fg.clearLayers();
    drawnShapes.forEach((shape) => {
      const id = String((shape as any).id || shape.properties?.id || '');
      const layer = L.geoJSON(shape as any, {
        style: { ...POLY_STYLE },
        onEachFeature: (feature, lyr) => {
          (lyr as any)._drawId = id || feature.properties?.id;
          if (feature.properties?.name) {
            lyr.bindPopup(`<b>${feature.properties.name}</b>`);
          }
        },
      });
      fg.addLayer(layer);
    });
  }, [drawnShapes]);

  return null;
};

export default LeafletDrawControl;
