"use client";

import { useEffect } from "react";

export const CLIENT_PROVIDER_STORAGE_KEY = "mxpage:provider-credentials:v1";

type StoredProviderCredentials = {
  apiKey?: string;
  baseUrl?: string;
  imageApiKey?: string;
  imageBaseUrl?: string;
  userAgent?: string;
};

function readCredentials(): StoredProviderCredentials {
  try {
    const raw = window.localStorage.getItem(CLIENT_PROVIDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredProviderCredentials;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "",
      imageApiKey: typeof parsed.imageApiKey === "string" ? parsed.imageApiKey.trim() : "",
      imageBaseUrl: typeof parsed.imageBaseUrl === "string" ? parsed.imageBaseUrl.trim() : "",
      userAgent: typeof parsed.userAgent === "string" ? parsed.userAgent.trim() : "",
    };
  } catch {
    return {};
  }
}

function shouldAttachCredentials(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("/api/")) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function ProviderCredentialFetchBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      if (!shouldAttachCredentials(input)) {
        return originalFetch(input, init);
      }

      const credentials = readCredentials();
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));

      if (credentials.apiKey) {
        headers.set("x-mxpage-api-key", credentials.apiKey);
        headers.set("x-mxpage-text-api-key", credentials.apiKey);
      }
      if (credentials.baseUrl) {
        headers.set("x-mxpage-base-url", credentials.baseUrl);
        headers.set("x-mxpage-text-base-url", credentials.baseUrl);
      }
      if (credentials.imageApiKey || credentials.apiKey) {
        headers.set("x-mxpage-image-api-key", credentials.imageApiKey || credentials.apiKey || "");
      }
      if (credentials.imageBaseUrl || credentials.baseUrl) {
        headers.set("x-mxpage-image-base-url", credentials.imageBaseUrl || credentials.baseUrl || "");
      }
      if (credentials.userAgent) {
        headers.set("x-mxpage-user-agent", credentials.userAgent);
      }

      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
