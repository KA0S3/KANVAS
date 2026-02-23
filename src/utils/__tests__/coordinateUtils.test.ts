import { 
  globalToLocalCoords, 
  localToGlobalCoords, 
  screenToViewportCoords,
  viewportToScreenCoords,
  calculateCenterTransform,
  getDefaultViewportConfig 
} from '../coordinateUtils';
import type { Asset } from '@/components/AssetItem';

describe('Coordinate Utils', () => {
  const mockAsset: Asset = {
    id: 'test-asset',
    name: 'Test Asset',
    type: 'other',
    x: 100,
    y: 50,
    children: [],
    customFields: [],
  };

  const mockViewport = {
    zoom: 1,
    panX: 0,
    panY: 0,
  };

  describe('globalToLocalCoords', () => {
    it('should convert global coordinates to local coordinates relative to asset', () => {
      const globalPoint = { x: 150, y: 100 };
      const localPoint = globalToLocalCoords(globalPoint, mockAsset, mockViewport);
      
      expect(localPoint.x).toBe(50); // 150 - 100
      expect(localPoint.y).toBe(50); // 100 - 50
    });
  });

  describe('localToGlobalCoords', () => {
    it('should convert local coordinates to global coordinates', () => {
      const localPoint = { x: 50, y: 50 };
      const globalPoint = localToGlobalCoords(localPoint, mockAsset, mockViewport);
      
      expect(globalPoint.x).toBe(150); // 50 + 100
      expect(globalPoint.y).toBe(100); // 50 + 50
    });
  });

  describe('screenToViewportCoords', () => {
    it('should convert screen coordinates to viewport coordinates', () => {
      const screenPoint = { x: 210, y: 120 };
      const viewportWithZoom = { zoom: 2, panX: 10, panY: 20 };
      const viewportPoint = screenToViewportCoords(screenPoint, viewportWithZoom);
      
      // (210 - 10) / 2 = 100
      expect(viewportPoint.x).toBe(100);
      // (120 - 20) / 2 = 50
      expect(viewportPoint.y).toBe(50);
    });
  });

  describe('viewportToScreenCoords', () => {
    it('should convert viewport coordinates to screen coordinates', () => {
      const viewportPoint = { x: 100, y: 50 };
      const viewportWithZoom = { zoom: 2, panX: 10, panY: 20 };
      const screenPoint = viewportToScreenCoords(viewportPoint, viewportWithZoom);
      
      // 100 * 2 + 10 = 210
      expect(screenPoint.x).toBe(210);
      // 50 * 2 + 20 = 120
      expect(screenPoint.y).toBe(120);
    });
  });

  describe('calculateCenterTransform', () => {
    it('should calculate transform to center asset in viewport', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const transform = calculateCenterTransform(mockAsset, containerWidth, containerHeight);
      
      // Asset center: x=100+100=200, y=50+25=75
      // Expected pan: x=800/2-200=200, y=600/2-75=225
      expect(transform.panX).toBe(200);
      expect(transform.panY).toBe(225);
      expect(transform.zoom).toBe(1);
    });
  });

  describe('round trip conversion', () => {
    it('should maintain coordinates after round trip conversion', () => {
      const originalGlobal = { x: 250, y: 175 };
      const local = globalToLocalCoords(originalGlobal, mockAsset, mockViewport);
      const backToGlobal = localToGlobalCoords(local, mockAsset, mockViewport);
      
      expect(backToGlobal.x).toBeCloseTo(originalGlobal.x);
      expect(backToGlobal.y).toBeCloseTo(originalGlobal.y);
    });

    it('should maintain screen coordinates after viewport round trip', () => {
      const originalScreen = { x: 210, y: 120 };
      const viewportWithZoom = { zoom: 2, panX: 10, panY: 20 };
      const viewport = screenToViewportCoords(originalScreen, viewportWithZoom);
      const backToScreen = viewportToScreenCoords(viewport, viewportWithZoom);
      
      expect(backToScreen.x).toBeCloseTo(originalScreen.x);
      expect(backToScreen.y).toBeCloseTo(originalScreen.y);
    });
  });
});
