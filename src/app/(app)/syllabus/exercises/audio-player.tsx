"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, name }: { src: string; name?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate, src]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  if (!src) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Chưa có file nghe. Tải file ở phần soạn đề để học sinh phát, tua và chỉnh tốc độ.
      </div>
    );
  }

  function seek(next: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.min(Math.max(next, 0), duration || 0);
    audio.currentTime = clamped;
    setCurrent(clamped);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {name ? <p className="mb-2 truncate text-xs text-slate-500">{name}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) void audio.play();
            else audio.pause();
          }}
          className={buttonClass("primary", "icon")}
          aria-label={playing ? "Tạm dừng" : "Phát"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => seek(current - 5)}
          className={buttonClass("outline", "icon")}
          aria-label="Tua lại 5 giây"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => seek(current + 5)}
          className={buttonClass("outline", "icon")}
          aria-label="Tua tới 5 giây"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <span className="min-w-[4.5rem] text-xs tabular-nums text-slate-500">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1.5 min-w-[8rem] flex-1 accent-brand-600"
        />
        <Select
          value={String(rate)}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-24"
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
