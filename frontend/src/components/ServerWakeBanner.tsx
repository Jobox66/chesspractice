import { Loader2 } from 'lucide-react';
import { useServerWake } from '../services/serverWake';
import '../css/serverWake.css';

// Shown while a request is waiting for the free-tier backend to spin up.
export function ServerWakeBanner() {
  const { waking, failed, shown } = useServerWake();
  if (!shown || (!waking && !failed)) return null;

  return (
    <div className="server-wake" role="status" aria-live="polite">
      {failed ? (
        <>
          <span>Không kết nối được server.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Thử lại
          </button>
        </>
      ) : (
        <>
          <Loader2 className="server-wake__spinner" size={16} aria-hidden />
          <span>Đang khởi động server (gói miễn phí), lần đầu mất khoảng 1 phút…</span>
        </>
      )}
    </div>
  );
}
