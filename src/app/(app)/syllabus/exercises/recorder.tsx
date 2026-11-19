"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Square, Trash2, Upload } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

import { AudioPlayer } from "./audio-player";

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function pickMime(kind: "audio" | "video") {
  const list =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      : ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
  return list.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

export function AudioRecorder({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ ghi âm. Hãy tải file audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime("audio");
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        onChange(URL.createObjectURL(blob));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((prev) => prev + 1), 1000);
    } catch {
      setError("Không mở được micro. Cho phép quyền ghi âm hoặc tải file.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
      {label ? <p className="text-sm font-medium text-slate-800">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className={buttonClass("danger", "sm")}>
            <Square className="h-3.5 w-3.5 fill-current" />
            Dừng · {formatClock(seconds)}
          </button>
        ) : (
          <button type="button" onClick={start} className={buttonClass("primary", "sm")}>
            <Circle className="h-3.5 w-3.5 fill-current" />
            {value ? "Ghi lại" : "Bắt đầu ghi âm"}
          </button>
        )}
        <label className={buttonClass("outline", "sm")}>
          <Upload className="h-4 w-4" />
          Tải file
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onChange(URL.createObjectURL(file));
            }}
          />
        </label>
        {value ? (
          <button type="button" onClick={() => onChange("")} className={buttonClass("ghost", "sm")}>
            <Trash2 className="h-4 w-4" />
            Xóa
          </button>
        ) : null}
        {recording ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
            Đang ghi
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {value ? <AudioPlayer src={value} name="Bài nói của bạn" /> : null}
    </div>
  );
}

export function VideoSubmit({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ quay. Hãy tải file video.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        void liveRef.current.play();
      }
      const mime = pickMime("video");
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (liveRef.current) liveRef.current.srcObject = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        onChange(URL.createObjectURL(blob));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((prev) => prev + 1), 1000);
    } catch {
      setError("Không mở được camera. Cho phép quyền hoặc tải file video.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className={buttonClass("danger", "sm")}>
            <Square className="h-3.5 w-3.5 fill-current" />
            Dừng quay · {formatClock(seconds)}
          </button>
        ) : (
          <button type="button" onClick={start} className={buttonClass("primary", "sm")}>
            <Circle className="h-3.5 w-3.5 fill-current" />
            {value ? "Quay lại" : "Quay video"}
          </button>
        )}
        <label className={buttonClass("outline", "sm")}>
          <Upload className="h-4 w-4" />
          Tải video
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onChange(URL.createObjectURL(file));
            }}
          />
        </label>
        {value ? (
          <button type="button" onClick={() => onChange("")} className={buttonClass("ghost", "sm")}>
            <Trash2 className="h-4 w-4" />
            Xóa
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <video
        ref={liveRef}
        muted
        playsInline
        className={recording ? "aspect-video w-full rounded-lg bg-slate-900" : "hidden"}
      />
      {!recording && value ? (
        <video src={value} controls className="aspect-video w-full rounded-lg bg-slate-900" />
      ) : null}
      {!recording && !value ? (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          Chưa có video
        </div>
      ) : null}
    </div>
  );
}
