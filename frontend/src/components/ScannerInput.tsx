import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ResponsiveDialog';

interface ScannerInputProps {
  onScan: (barcode: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

export function ScannerInput({
  onScan,
  disabled = false,
  autoFocus = true,
  placeholder = 'امسح الباركود أو اكتب يدويا',
  className,
}: ScannerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = value.trim();
      if (v) {
        onScan(v);
        setValue('');
      }
    }
  }

  function handleCameraScan(barcode: string) {
    setCameraOpen(false);
    onScan(barcode);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className={`flex gap-2 items-center ${className ?? ''}`}>
      <div className="relative flex-1">
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none select-none text-sm">
          ▮▮▮
        </span>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          dir="ltr"
          className="pr-9 text-base font-mono"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCameraOpen(true)}
        disabled={disabled}
        title="مسح بالكاميرا"
        aria-label="مسح بالكاميرا"
      >
        📷
      </Button>
      {cameraOpen && (
        <CameraScanDialog onScan={handleCameraScan} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}

function CameraScanDialog({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startScan() {
      setScanning(true);
      setError(null);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              controls.stop();
              onScan(result.getText());
            } else if (err && !(err instanceof Error && err.name === 'NotFoundException')) {
              // Ignore NotFoundException — it fires on every frame with no barcode
            }
          },
        );
        controlsRef.current = controls;
      } catch (e) {
        if (!cancelled) setError('تعذر فتح الكاميرا. تحقق من الصلاحيات.');
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    void startScan();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>مسح الباركود بالكاميرا</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-red-600 text-center p-4">{error}</p>
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full rounded"
              style={{ maxHeight: 260 }}
              autoPlay
              playsInline
              muted
            />
            {scanning && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                جارٍ التهيئة...
              </p>
            )}
            <p className="text-xs text-center text-muted-foreground mt-1">
              وجّه الكاميرا نحو الباركود
            </p>
          </div>
        )}
        <Button variant="outline" onClick={onClose}>
          إغلاق
        </Button>
      </DialogContent>
    </Dialog>
  );
}
