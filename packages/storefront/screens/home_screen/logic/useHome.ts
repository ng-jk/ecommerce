import { type Product } from "@portfolio/api-client";
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions, type ScrollView } from "react-native";
import { useStore } from "../../store_shell_screen";
export function useHome() {
  const { api, theme, shop, setMessage } = useStore();
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1),
    [lastPage, setLastPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const collectionYRef = useRef(0);
  const contentYRef = useRef(0);
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setFailed(false);
        try {
          const data = await api.catalog(search, category, page);
          if (live) {
            setProducts(data.products.data);
            setCategories(data.categories);
            setLastPage(data.products.meta.last_page);
          }
        } catch (e) {
          if (live) {
            setMessage((e as Error).message);
            setFailed(true);
          }
        } finally {
          if (live) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, search, category, page, retry, setMessage]);
  return {
    products,
    categories,
    search,
    setSearch,
    category,
    setCategory,
    loading,
    page,
    setPage,
    lastPage,
    setRetry,
    failed,
    scrollRef,
    collectionYRef,
    contentYRef,
    wide,
    width,
    theme,
    shop,
  };
}
