import { useEffect, useRef, useState } from "react";
import { Bluetooth, BluetoothOff, Droplets, Thermometer, CloudRain, FlaskConical, Waves, Power, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const CHAR_UUID = "12345678-1234-5678-1234-56789abcdef1";

type Reading = {
  t: number; h: number; wt: number; sm: number; ph: number; rain: number; pump: number;
};

type Alert = { id: string; label: string; severity: "warn" | "danger" };

function evaluateAlerts(r: Reading): Alert[] {
  const a: Alert[] = [];
  if (r.sm < 20) a.push({ id: "sm-low", label: `رطوبة التربة منخفضة جداً (${r.sm}%)`, severity: "danger" });
  else if (r.sm < 40) a.push({ id: "sm-warn", label: `رطوبة التربة منخفضة (${r.sm}%)`, severity: "warn" });
  if (r.t > 40) a.push({ id: "t-high", label: `حرارة الجو مرتفعة (${r.t.toFixed(1)}°C)`, severity: "danger" });
  if (r.ph < 5.5 || r.ph > 8.5) a.push({ id: "ph", label: `pH خارج النطاق (${r.ph.toFixed(2)})`, severity: "danger" });
  if (r.wt > 35) a.push({ id: "wt", label: `حرارة الماء مرتفعة (${r.wt.toFixed(1)}°C)`, severity: "warn" });
  if (r.h < 25) a.push({ id: "h-low", label: `رطوبة الجو منخفضة (${r.h.toFixed(0)}%)`, severity: "warn" });
  return a;
}

// Police-siren style oscillating tone
function useSiren() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (oscRef.current) { try { oscRef.current.stop(); } catch {} oscRef.current.disconnect(); oscRef.current = null; }
    if (gainRef.current) { gainRef.current.disconnect(); gainRef.current = null; }
    setPlaying(false);
  };

  const start = () => {
    if (playing) return;
    const ctx = ctxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 700;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    oscRef.current = osc;
    gainRef.current = gain;
    let high = true;
    timerRef.current = window.setInterval(() => {
      osc.frequency.linearRampToValueAtTime(high ? 1200 : 600, ctx.currentTime + 0.4);
      high = !high;
    }, 400);
    setPlaying(true);
  };

  useEffect(() => () => stop(), []);
  return { start, stop, playing };
}

export default function Dashboard() {
  const [supported, setSupported] = useState(true);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("");
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const deviceRef = useRef<any>(null);
  const siren = useSiren();

  useEffect(() => {
    if (typeof navigator !== "undefined" && !(navigator as any).bluetooth) setSupported(false);
  }, []);

  const alerts = reading ? evaluateAlerts(reading) : [];
  const hasDanger = alerts.some(a => a.severity === "danger");

  useEffect(() => {
    if (!muted && hasDanger && connected) siren.start();
    else siren.stop();
  }, [hasDanger, muted, connected]);

  const handleDisconnect = () => {
    setConnected(false);
    setDeviceName("");
    siren.stop();
  };

  const connect = async () => {
    setError("");
    try {
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });
      deviceRef.current = device;
      device.addEventListener("gattserverdisconnected", handleDisconnect);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const ch = await service.getCharacteristic(CHAR_UUID);
      await ch.startNotifications();
      ch.addEventListener("characteristicvaluechanged", (e: any) => {
        const value: DataView = e.target.value;
        const text = new TextDecoder().decode(value);
        try {
          const json = JSON.parse(text) as Reading;
          setReading(json);
        } catch {}
      });
      setConnected(true);
      setDeviceName(device.name || "ESP32");
    } catch (e: any) {
      setError(e?.message || "فشل الاتصال");
    }
  };

  const disconnect = () => {
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    handleDisconnect();
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">نظام الري الذكي</h1>
              <p className="text-xs text-muted-foreground">ESP32 · Bluetooth Live</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${connected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
              {connected ? `متصل بـ ${deviceName}` : "غير متصل"}
            </span>
            {!connected ? (
              <Button onClick={connect} disabled={!supported} className="gap-2">
                <Bluetooth className="h-4 w-4" /> اتصال بلوتوث
              </Button>
            ) : (
              <Button variant="secondary" onClick={disconnect} className="gap-2">
                <BluetoothOff className="h-4 w-4" /> قطع الاتصال
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!supported && (
          <Card className="mb-6 border-destructive/50 bg-destructive/10 p-4 text-sm">
            متصفحك لا يدعم Web Bluetooth. استخدم Chrome أو Edge على ديسكتوب أو أندرويد.
          </Card>
        )}
        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</Card>
        )}

        {alerts.length > 0 && (
          <div className={`mb-6 rounded-xl border p-4 ${hasDanger ? "border-destructive bg-destructive/15 animate-pulse" : "border-yellow-500/40 bg-yellow-500/10"}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-5 w-5" />
                تنبيهات نشطة
              </div>
              {hasDanger && (
                <Button size="sm" variant="secondary" onClick={() => setMuted(m => !m)}>
                  {muted ? "تشغيل الصافرة" : "كتم الصافرة"}
                </Button>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {alerts.map(a => <li key={a.id}>• {a.label}</li>)}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SensorCard icon={<Thermometer className="h-5 w-5" />} label="حرارة الجو" value={reading ? `${reading.t.toFixed(1)} °C` : "—"} />
          <SensorCard icon={<Droplets className="h-5 w-5" />} label="رطوبة الجو" value={reading ? `${reading.h.toFixed(0)} %` : "—"} />
          <SensorCard icon={<Waves className="h-5 w-5" />} label="حرارة الماء" value={reading ? `${reading.wt.toFixed(1)} °C` : "—"} />
          <SensorCard icon={<Droplets className="h-5 w-5" />} label="رطوبة التربة" value={reading ? `${reading.sm} %` : "—"} highlight={reading ? reading.sm < 40 : false} />
          <SensorCard icon={<FlaskConical className="h-5 w-5" />} label="درجة الحموضة pH" value={reading ? reading.ph.toFixed(2) : "—"} />
          <SensorCard icon={<CloudRain className="h-5 w-5" />} label="المطر" value={reading ? (reading.rain ? "ممطر" : "لا يوجد") : "—"} />
          <Card className="col-span-full flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${reading?.pump ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Power className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">مضخة الري</p>
                <p className="text-lg font-bold">{reading?.pump ? "تعمل الآن" : "متوقفة"}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${reading?.pump ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
              {reading?.pump ? "ON" : "OFF"}
            </span>
          </Card>
        </div>

        {!connected && (
          <Card className="mt-8 p-6 text-sm text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">طريقة الاستخدام:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>ارفع كود <code className="rounded bg-muted px-1">smart_irrigation_ble.ino</code> على ESP32 (موجود في <code className="rounded bg-muted px-1">/arduino/</code>).</li>
              <li>افتح هذه الصفحة من Chrome أو Edge.</li>
              <li>اضغط "اتصال بلوتوث" واختر <b>SmartIrrigation-ESP32</b>.</li>
              <li>عند تجاوز أي قراءة الحدود الآمنة، تنطلق صافرة تنبيه تلقائياً.</li>
            </ol>
          </Card>
        )}
      </main>
    </div>
  );
}

function SensorCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-5 transition-colors ${highlight ? "border-destructive/60 bg-destructive/10" : ""}`}>
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}