import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { animate, motionValue, type AnimationPlaybackControls, type ValueAnimationTransition } from "motion";
import type { DropdownParameters } from "./interactionFixtures.js";

const ease = { linear: "linear", ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] } as const;

/** Animate one normalized value. Parameter edits don't restart the interaction. */
export function useFixtureMotion(menu: RefObject<HTMLDivElement | null>, parameters: DropdownParameters, open: boolean, reduced: boolean, replay: number, playbackRate: number) {
  const [progress] = useState(() => motionValue(open ? 1 : 0));
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const lastReplay = useRef(replay);
  const generation = useRef(0);
  const latest = useRef({ parameters, open, reduced, playbackRate });
  latest.current = { parameters, open, reduced, playbackRate };

  function render(): void {
    const element = menu.current;
    if (!element) return;
    const state = latest.current, value = progress.get();
    const travel = (1 - value) * state.parameters.distancePx;
    const direction = state.parameters.direction;
    const x = direction === "left" ? -travel : direction === "right" ? travel : 0;
    const y = direction === "above" ? -travel : direction === "below" ? travel : 0;
    element.style.opacity = String(Math.max(0, Math.min(1, value)));
    element.style.transform = state.reduced || state.parameters.motion.model === "instant" ? "none" : `translate3d(${x}px, ${y}px, 0)`;
    element.style.visibility = state.open || value > 0.001 ? "visible" : "hidden";
  }

  useLayoutEffect(() => {
    const unsubscribe = progress.on("change", render);
    render();
    return () => { generation.current++; controls.current?.stop(); progress.stop(); unsubscribe(); };
  }, [progress]);
  useLayoutEffect(render, [parameters, reduced]);
  useLayoutEffect(() => { if (controls.current) controls.current.speed = playbackRate; }, [playbackRate]);

  useLayoutEffect(() => {
    const run = ++generation.current, element = menu.current;
    if (!element) return;
    const target = open ? 1 : 0;
    const replayed = lastReplay.current !== replay;
    lastReplay.current = replay;
    const settings = latest.current.parameters.motion;
    const wasMoving = progress.isAnimating();
    const velocity = progress.getVelocity();
    if (replayed) progress.jump(0);
    if (reduced || settings.model === "instant" || (!replayed && !wasMoving && progress.get() === target)) {
      progress.jump(target); element.dataset.motionActive = "false"; render(); return;
    }
    const transition: ValueAnimationTransition<number> = settings.model === "tween" ? { type: "tween", duration: settings.durationMs / 1000, ease: ease[settings.easing] } : {
      type: "spring", mass: settings.mass, stiffness: settings.stiffness, damping: settings.damping,
      velocity: wasMoving && !replayed ? velocity : settings.initialVelocity, restSpeed: 0.01, restDelta: 0.001,
    };
    element.dataset.motionActive = "true";
    controls.current = animate(progress, target, { ...transition, onComplete: () => {
      if (run !== generation.current) return;
      element.dataset.motionActive = "false"; render();
    } });
    controls.current.speed = latest.current.playbackRate;
    render();
    // New runs replace the prior MotionValue animation; velocity/current position survive reversal.
  }, [open, replay, reduced, progress]);
}
