import { useState, useEffect } from 'react';
import { apiService } from '../src/_services/apiService';
import { DEFAULT_CATEGORIES } from '../lib/firebaseHelpers/index';

export function useCategories() {
  const defaultCategoryObjects = Array.isArray(DEFAULT_CATEGORIES)
    ? DEFAULT_CATEGORIES.map((cat: any) =>
      typeof cat === 'string' ? { name: cat, image: '' } : cat
    )
    : [];

  const [categories, setCategories] = useState(defaultCategoryObjects);

  const loadCategories = async () => {
    try {
      const cats = await apiService.getCategories();
      const mappedCats = Array.isArray(cats?.data)
        ? cats.data.map((c: any) => {
          if (typeof c === 'string') return { name: c, image: '' };
          return {
            name: typeof c.name === 'string' ? c.name : '',
            image: typeof c.image === 'string' ? c.image : ''
          };
        }).filter((c: any) => c.name)
        : [];
      setCategories(mappedCats.length > 0 ? mappedCats : defaultCategoryObjects);
    } catch (error) {
      setCategories(defaultCategoryObjects);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  return { categories, loadCategories };
}
