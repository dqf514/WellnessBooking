import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";

const FRAME = 300; // 裁剪框边长（CSS 像素），与页面上的头像显示比例一致

type Offset = { x: number; y: number };

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

/**
 * 图片裁剪弹窗：拖动图片、缩放后按目标比例导出，让上传结果与页面上的头像/图片显示一致。
 */
export function PhotoCropper({ file, aspect = 1, allowOriginal = false, onConfirm, onCancel }: {
  file: File;
  aspect?: number;
  allowOriginal?: boolean;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const { local } = useLanguage();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragging = useRef<Offset | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameW = FRAME;
  const frameH = Math.round(FRAME / aspect);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setImage(img); setZoom(1); setOffset({ x: 0, y: 0 }); };
    img.src = url;
    return () => { img.onload = null; URL.revokeObjectURL(url); };
  }, [file]);

  const metrics = useMemo(() => {
    if (!image) return null;
    const base = Math.max(frameW / image.naturalWidth, frameH / image.naturalHeight);
    const dw = image.naturalWidth * base * zoom;
    const dh = image.naturalHeight * base * zoom;
    return { dw, dh, minX: frameW - dw, minY: frameH - dh };
  }, [image, zoom, frameW, frameH]);

  const limit = useMemo(() => ({ x: metrics ? metrics.minX : 0, y: metrics ? metrics.minY : 0 }), [metrics]);

  function pan(dx: number, dy: number) {
    setOffset((current) => ({ x: clamp(current.x + dx, limit.x, 0), y: clamp(current.y + dy, limit.y, 0) }));
  }

  function changeZoom(value: number) {
    const next = clamp(value, 1, 3);
    setZoom(next);
    // 缩放后按新尺寸重新夹取位移，避免缩小时露出空白。
    if (!image) return;
    const base = Math.max(frameW / image.naturalWidth, frameH / image.naturalHeight);
    const dw = image.naturalWidth * base * next;
    const dh = image.naturalHeight * base * next;
    setOffset((current) => ({ x: clamp(current.x, frameW - dw, 0), y: clamp(current.y, frameH - dh, 0) }));
  }

  function reset() { setZoom(1); setOffset({ x: 0, y: 0 }); }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !metrics) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = frameW * ratio; canvas.height = frameH * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, frameW, frameH);
    ctx.drawImage(image, offset.x, offset.y, metrics.dw, metrics.dh);
  }, [image, metrics, offset, frameW, frameH]);

  async function confirm() {
    if (!image || !metrics) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = Math.round(640 / aspect);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const factor = canvas.width / frameW;
      ctx.drawImage(image, offset.x * factor, offset.y * factor, metrics.dw * factor, metrics.dh * factor);
      const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob((value) => resolve(value), "image/jpeg", 0.9); });
      if (blob) onConfirm(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } finally { setBusy(false); }
  }

  return <Modal title={local("调整照片位置", "Adjust the photo")} onClose={onCancel}>
    <div className="photo-cropper">
      <p className="form-help">{local("拖动照片调整位置，用滑块放大或缩小；保存后会按这个取景显示在头像与列表里。", "Drag the photo to reposition and use the slider to zoom. What you see here is what appears on avatars and lists.")}</p>
      <div className="photo-crop-frame" style={{ width: frameW, height: frameH }} onPointerDown={(event) => { dragging.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragging.current) return; const dx = event.clientX - dragging.current.x; const dy = event.clientY - dragging.current.y; dragging.current = { x: event.clientX, y: event.clientY }; pan(dx, dy); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onWheel={(event) => changeZoom(zoom - event.deltaY * 0.0015)}>
        <canvas ref={canvasRef} style={{ width: frameW, height: frameH }}/>
        {!image && <span className="photo-crop-loading">{local("图片读取中…", "Loading image…")}</span>}
      </div>
      <label className="photo-crop-zoom">{local("缩放", "Zoom")}<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => changeZoom(Number(event.target.value))}/></label>
      <div className="photo-crop-actions">
        <button className="button button-outline" type="button" onClick={reset}>{local("重置", "Reset")}</button>
        <button className="button button-outline" type="button" onClick={onCancel}>{local("取消", "Cancel")}</button>
        {allowOriginal && <button className="button button-outline" type="button" onClick={() => onConfirm(file)}>{local("使用原图", "Use original")}</button>}
        <button className="button button-primary" type="button" disabled={busy || !image} onClick={() => void confirm()}>{busy ? local("处理中…", "Working…") : local("确认裁剪", "Apply crop")}</button>
      </div>
    </div>
  </Modal>;
}
