type AndroidGooglePlugin = {
  start(options: { next: string }): Promise<void>;
  finish(): Promise<{ code: string; state: string; verifier: string; next: string }>;
};

export function getAndroidGooglePlugin() {
  const native = (window as Window & {
    Capacitor?: {
      isPluginAvailable?: (name: string) => boolean;
      Plugins?: { TahaddiGoogle?: AndroidGooglePlugin };
    };
  }).Capacitor;
  return native?.isPluginAvailable?.('TahaddiGoogle') ? native.Plugins?.TahaddiGoogle : undefined;
}
