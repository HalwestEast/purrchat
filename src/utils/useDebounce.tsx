type Debounced<T extends (...args: any[]) => any> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void;
};

export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  wait = 300,
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced as Debounced<T>;
}
