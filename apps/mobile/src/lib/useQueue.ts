import { useEffect, useState } from "react";
import { readQueue, subscribe, type QueueItem } from "./queue";

export function useQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  useEffect(() => {
    readQueue().then(setItems);
    return subscribe(setItems);
  }, []);
  return items;
}
