import { useCallback, useRef, useState } from "react";

export function useAsync<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);

  const run = useCallback(async (request: Promise<T>) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await request;
      if (id === requestId.current) setData(result);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong";
      if (id === requestId.current) setError(message);
      throw caught;
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { data, error, isLoading, run, setData, clearError };
}
