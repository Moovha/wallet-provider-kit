import type { ApiContract } from './api-reference';
export interface SwaggerInstance {
  specActions: { updateSpec: (spec: string) => void };
}
type SwaggerFactory = (options: {
  spec: ApiContract;
  [key: string]: unknown;
}) => SwaggerInstance;
declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerFactory;
  }
}
let pending: Promise<SwaggerFactory> | undefined;
export function loadSwagger() {
  if (window.SwaggerUIBundle) return Promise.resolve(window.SwaggerUIBundle);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/reference/swagger-ui.css';
    document.head.append(styles);
    const script = document.createElement('script');
    script.src = '/reference/swagger-ui-bundle.js';
    script.async = true;
    const fail = () => {
      pending = undefined;
      script.remove();
      styles.remove();
      reject(new Error('Swagger UI unavailable'));
    };
    script.onload = () =>
      window.SwaggerUIBundle ? resolve(window.SwaggerUIBundle) : fail();
    script.onerror = fail;
    document.head.append(script);
  });
  return pending;
}
