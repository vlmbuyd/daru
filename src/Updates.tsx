import React, {useEffect, useState} from 'react';
import type {UpdateStatus} from './storage';

const labels: Record<UpdateStatus['phase'], string> = {
  disabled: '서명된 배포판에서 사용할 수 있어요.',
  idle: '업데이트 확인 가능',
  checking: '확인 중…',
  downloading: '다운로드 중…',
  current: '최신 버전이에요.',
  ready: '업데이트를 설치할 수 있어요.',
  error: '업데이트를 확인하지 못했어요.',
};

export function Updates({busy}: {busy: boolean}) {
  const [status, setStatus] = useState<UpdateStatus>();
  useEffect(() => {
    const desktop = window.daru;
    if (!desktop) return;
    let active = true;
    const refresh = () => void desktop.updates().then(value => {
      if (active) setStatus(value);
    }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!window.daru) return null;
  return <section aria-label="앱 업데이트">
    <h3>앱 업데이트</h3>
    {status && <p>{status.version} · {labels[status.phase]} {status.nextVersion}</p>}
    {status && ['idle', 'current', 'error'].includes(status.phase) &&
      <button onClick={() => void window.daru?.checkUpdates().then(setStatus)}>업데이트 확인</button>}
    {status?.phase === 'ready' &&
      <button disabled={busy} onClick={() => void window.daru?.installUpdate()}>재시작하여 설치</button>}
  </section>;
}
