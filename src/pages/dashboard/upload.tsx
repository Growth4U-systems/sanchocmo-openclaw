import { useCallback, useState } from "react";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleUpload = async (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) continue;

      setUploading(true);
      setProgress(0);

      const interval = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.random() * 20));
      }, 200);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });

        clearInterval(interval);
        setProgress(100);

        if (!res.ok) throw new Error("Upload failed");
        const { url } = await res.json();

        setFiles((prev) => [
          {
            id: crypto.randomUUID(),
            name: file.name,
            url,
            size: file.size,
            uploadedAt: new Date(),
          },
          ...prev,
        ]);
      } catch (err) {
        clearInterval(interval);
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
        setProgress(0);
      }
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
  }, []);

  function formatSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  return (
    <DashboardLayout>
      <Head>
        <title>Upload — Mission Control</title>
      </Head>

      <h1 className="font-heading text-2xl text-navy mb-1">File Upload</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload images to Cloudflare R2 storage.
      </p>

      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-colors mb-6 ${
          dragActive
            ? "border-rust bg-rust/5"
            : "border-border hover:border-muted-foreground"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploading}
        />
        <p className="text-sm font-semibold">
          {dragActive ? "Drop files here" : "Click or drag & drop images"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PNG, JPG, GIF, WebP — max 5MB
        </p>
      </div>

      {/* Progress */}
      {uploading && (
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1">
            <span>Uploading...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-border rounded-full h-2">
            <div
              className="bg-rust h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Uploaded files */}
      {files.length > 0 && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-5 shadow-comic">
          <h2 className="font-heading text-base text-navy mb-3">
            Uploaded ({files.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <div
                key={f.id}
                className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.name}
                  className="w-full h-32 object-cover bg-muted"
                />
                <div className="p-2">
                  <p className="text-xs font-semibold truncate">{f.name}</p>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>{formatSize(f.size)}</span>
                    <span>{f.uploadedAt.toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <button
                      onClick={() => navigator.clipboard.writeText(f.url)}
                      className="flex-1 text-[10px] px-2 py-1 border rounded hover:bg-background"
                    >
                      Copy URL
                    </button>
                    <button
                      onClick={() => window.open(f.url, "_blank")}
                      className="flex-1 text-[10px] px-2 py-1 border rounded hover:bg-background"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
