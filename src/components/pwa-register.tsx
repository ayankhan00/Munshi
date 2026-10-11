"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

export function PwaRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}
