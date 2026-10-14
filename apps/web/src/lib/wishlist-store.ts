'use client';

import { useState, useEffect } from 'react';

const WISHLIST_KEY = 'eplant_wishlist_ids';

export function useWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_KEY);
      if (saved) {
        setWishlist(JSON.parse(saved));
      }
    } catch {
      // localStorage unavailable or blocked
    }
  }, []);

  const toggleWishlist = (id: string) => {
    setWishlist((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      try {
        localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isWishlisted = (id: string) => wishlist.includes(id);

  return { wishlist, toggleWishlist, isWishlisted };
}
