import { useState, useEffect, useRef } from 'react';

export default function GenerationPanel({ batchId, onComplete }) {
  const [status, setStatus] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastCheck, setLastCheck] = useState(null);
  const startTime = useRef(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!batchId) return;

    const checkStatus = async () => {
      try {
        const result = await window.electronAPI.generator.status(batchId);
        setStatus(result);
        setLastCheck(new Date());
        if (result.status === 'ended' || result.status === 'completed') {
          onComplete?.(result);
        }
      } catch {
        // ignore polling errors
      }
    };

    checkStatus();
    intervalRef.current = setInterval(checkStatus, 30000);

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 60000));
    }, 10000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(timer);
    };
  }, [batchId, onComplete]);

  const handleManualCheck = async () => {
    try {
      const result = await window.electronAPI.generator.status(batchId);
      setStatus(result);
      setLastCheck(new Date());
      if (result.status === 'ended' || result.status === 'completed') {
        onComplete?.(result);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="animate-pulse">&#9203;</span>
        <span className="font-bold text-sm text-blue-800">バッチ生成中</span>
      </div>
      <div className="text-xs text-blue-700 space-y-1">
        <div>バッチID: {batchId}</div>
        {status && (
          <>
            <div>ステータス: {status.status}</div>
            {status.requestCounts && (
              <div>
                処理中: {status.requestCounts.processing ?? 0} / 成功:{' '}
                {status.requestCounts.succeeded ?? 0} / エラー:{' '}
                {status.requestCounts.errored ?? 0}
              </div>
            )}
          </>
        )}
        <div>経過時間: {elapsed}分</div>
        <div className="flex items-center gap-2">
          {lastCheck && (
            <span>最終確認: {lastCheck.toLocaleTimeString()}</span>
          )}
          <button
            onClick={handleManualCheck}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            今すぐ確認
          </button>
        </div>
      </div>
    </div>
  );
}
