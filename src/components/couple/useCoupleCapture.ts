import { useCallback, useEffect, useRef, useState } from 'react';
import { useCouple } from '../../state/coupleStore';
import { usePhotobooth } from '../../state/photoboothStore';

/**
 * The couple-booth glue: reacts to shared-fire moments, exchanges HD frames
 * after a local capture, and pushes the partner's video into the engine.
 *
 * In solo mode (no room) every branch is inert — `useCouple.active` is false
 * and the engine's remoteVideo stays null, so the solo product is untouched.
 */
export function useCoupleCapture(boothEngine: { capture: () => Promise<{ blob: Blob }> } | null) {
  const active = useCouple((s) => s.active);
  const fireAt = useCouple((s) => s.fireAt);
  const rtc = useCouple((s) => s.rtc);
  const addPhoto = usePhotobooth((s) => s.addPhoto);
  const transition = usePhotobooth((s) => s.transition);

  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const firedRef = useRef(false);

  /** The partner's shared-fire arrived — capture my side of the same instant. */
  useEffect(() => {
    if (!active || fireAt === null) return;
    const session = rtc()?.rtc;
    if (!session) return;

    // Fire when the *shared* clock reaches the moment. sharedNow is corrected
    // locally, so both shutters land within one clock offset of each other.
    let raf = 0;
    const tick = () => {
      const remaining = fireAt - session.sharedNow();
      if (remaining <= 0) {
        if (firedRef.current) return;
        firedRef.current = true;
        void (async () => {
          try {
            const result = await boothEngine?.capture();
            if (!result) return;
            const url = URL.createObjectURL(result.blob);
            const store = usePhotobooth.getState();
            const slot = useCouple.getState().fireSlot;
            addPhoto(
              {
                url,
                blob: result.blob,
                width: 1080,
                height: 1350,
                filter: store.filter,
                takenAt: Date.now(),
              },
              slot,
            );
            transition('CAPTURED');
            // Exchange my frame; the partner's arrives via onRemoteShot.
            await session.sendShot(slot, result.blob);
            setWaitingForPartner(false);
          } catch {
            // My capture failed; tell them so their slot stays honest.
            usePhotobooth.getState().pushToast('This shot missed on your side.', 'error');
          }
        })();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      firedRef.current = false;
    };
  }, [active, fireAt, rtc, boothEngine, addPhoto, transition]);

  /** Local capture finished — hand my frame to the partner. */
  const shareShot = useCallback(
    async (slot: number, blob: Blob) => {
      const session = rtc()?.rtc;
      if (!session || !active) return;
      setWaitingForPartner(true);
      await session.sendShot(slot, blob);
    },
    [active, rtc],
  );

  const scheduleShot = useCallback(
    (slot: number, countdownMs: number) => {
      const session = rtc()?.rtc;
      if (!session || !active) return null;
      const at = session.scheduleSharedShot(slot, countdownMs);
      useCouple.getState().clearFire();
      useCouple.setState({ fireAt: at, fireSlot: slot });
      return at;
    },
    [active, rtc],
  );

  const cancelShot = useCallback(() => {
    const session = rtc()?.rtc;
    session?.cancelSharedShot();
    useCouple.getState().clearFire();
  }, [rtc]);

  return { scheduleShot, cancelShot, shareShot, waitingForPartner };
}
