import { useState, useEffect, useRef, useCallback } from 'react';
import { setStepUpHandler } from '../../services/api';
import SensitiveActionModal from './SensitiveActionModal';

/**
 * Global MFA step-up prompt.
 *
 * The API client calls the handler registered here whenever the server answers a
 * request with "MFA verification required". This component shows the verification
 * modal, and resolves the handler's promise with the one-time action token (or null
 * if the user cancels); the client then replays the original request with it.
 *
 * Action tokens are single-use, so concurrent requests are queued and each gets its
 * own verification rather than sharing one token.
 *
 * Renders nothing until a step-up is needed.
 */
function MFAStepUpProvider() {
  // Resolver of the step-up currently on screen, or null.
  const [active, setActive] = useState(null);
  const queueRef = useRef([]);
  const activeRef = useRef(null);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() || null;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    setStepUpHandler(() =>
      new Promise((resolve) => {
        queueRef.current.push({ resolve });
        if (!activeRef.current) showNext();
      })
    );
    return () => {
      setStepUpHandler(null);
      // Unmounting with requests still waiting: let them fail rather than hang.
      if (activeRef.current) activeRef.current.resolve(null);
      queueRef.current.forEach((pending) => pending.resolve(null));
      queueRef.current = [];
      activeRef.current = null;
    };
  }, [showNext]);

  const finish = useCallback((token) => {
    if (activeRef.current) activeRef.current.resolve(token);
    showNext();
  }, [showNext]);

  if (!active) return null;

  // Above page-level dialogs (z-50): the action that triggered this usually came
  // from a confirmation modal that is still open underneath.
  return (
    <div className="relative z-[60]">
      <SensitiveActionModal
        actionType="generic"
        onSuccess={(token) => finish(token)}
        onCancel={() => finish(null)}
      />
    </div>
  );
}

export default MFAStepUpProvider;
