import { haversineKm } from './geo';

describe('haversineKm', () => {
  const lalbagh = { lat: 12.9507, lng: 77.5848 };
  const indiranagar = { lat: 12.9719, lng: 77.6412 };

  it('is zero for the same point', () => {
    expect(haversineKm(lalbagh, lalbagh)).toBe(0);
  });

  it('matches the known distance across Bengaluru', () => {
    // ~6.4 km as the crow flies.
    expect(haversineKm(lalbagh, indiranagar)).toBeCloseTo(6.4, 0);
  });

  it('is symmetric', () => {
    expect(haversineKm(lalbagh, indiranagar)).toBeCloseTo(haversineKm(indiranagar, lalbagh), 9);
  });

  it('handles antipodal points without NaN', () => {
    const value = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });

    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBeCloseTo(20015, 0);
  });
});
