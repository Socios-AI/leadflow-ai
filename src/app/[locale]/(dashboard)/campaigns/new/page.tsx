// src/app/[locale]/(dashboard)/campaigns/new/page.tsx
"use client";

import React, { useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Image,
  Video,
  Type,
  X,
  CheckCircle,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video" | "text" | null;

export default function NewCampaignPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);

    // Detect type
    if (selected.type.startsWith("image/")) {
      setMediaType("image");
      const url = URL.createObjectURL(selected);
      setPreview(url);
    } else if (selected.type.startsWith("video/")) {
      setMediaType("video");
      const url = URL.createObjectURL(selected);
      setPreview(url);
    }
  };

  const clearMedia = () => {
    setFile(null);
    setPreview(null);
    setMediaType(null);
    setTextContent("");
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());

      if (mediaType === "text") {
        formData.append("type", "TEXT");
        formData.append("transcription", textContent);
      } else if (file && mediaType) {
        formData.append("type", mediaType.toUpperCase());
        formData.append("file", file);
      } else {
        formData.append("type", "DIGITAL");
      }

      if (caption.trim()) {
        formData.append("caption", caption.trim());
      }

      const res = await fetch(`${window.location.origin}/api/campaigns`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        router.push(`/${locale}/campaigns`);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to create campaign:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/campaigns`}
          className="w-9 h-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-display font-semibold text-xl tracking-tight">
          {t("campaigns.addCampaign")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Name */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-4">
          <div className="space-y-2">
            <Label className="font-body text-sm font-medium">
              {t("campaigns.campaignName")}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Black Friday 2025, Summer Sale..."
              required
              className="font-body"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-body text-sm font-medium">
              {t("campaigns.campaignDescription")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="font-body resize-none"
              placeholder="Describe your campaign..."
            />
          </div>
        </div>

        {/* Media Type Selection */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-4">
          <div>
            <Label className="font-body text-sm font-medium">
              {t("campaigns.uploadMedia")}
            </Label>
            <p className="font-body text-xs text-[var(--text-secondary)] mt-1">
              {t("campaigns.uploadDescription")}
            </p>
          </div>

          {/* Type selector */}
          {!mediaType && !file && (
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[hsl(var(--border))] hover:border-[var(--brand)]/50 hover:bg-[var(--brand-glow)] transition-all"
              >
                <Image className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
                <span className="font-body text-xs font-medium">Image</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[hsl(var(--border))] hover:border-[var(--brand)]/50 hover:bg-[var(--brand-glow)] transition-all"
              >
                <Video className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
                <span className="font-body text-xs font-medium">Video</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaType("text")}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[hsl(var(--border))] hover:border-[var(--brand)]/50 hover:bg-[var(--brand-glow)] transition-all"
              >
                <Type className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
                <span className="font-body text-xs font-medium">Text</span>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Preview */}
          {mediaType === "text" && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  Text content
                </span>
                <button
                  type="button"
                  onClick={clearMedia}
                  className="text-xs text-red-500 hover:underline font-body"
                >
                  Remove
                </button>
              </div>
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                className="font-body resize-none"
                placeholder="Paste your ad copy, script, or campaign text here..."
              />
            </div>
          )}

          {file && preview && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  {mediaType === "image" ? (
                    <Image className="w-3.5 h-3.5" />
                  ) : (
                    <Video className="w-3.5 h-3.5" />
                  )}
                  {file.name}
                  <span className="text-[hsl(var(--muted-foreground))]">
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearMedia}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {mediaType === "image" && (
                <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                  <img
                    src={preview}
                    alt="Campaign media"
                    className="w-full max-h-[300px] object-cover"
                  />
                </div>
              )}

              {mediaType === "video" && (
                <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                  <video
                    src={preview}
                    controls
                    className="w-full max-h-[300px]"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--brand-glow)] border border-[var(--brand)]/20">
                <CheckCircle className="w-4 h-4 text-[var(--brand)] shrink-0" />
                <p className="font-body text-xs text-[var(--brand)]">
                  {mediaType === "image"
                    ? "AI will analyze this image and extract ad content automatically."
                    : "AI will transcribe the audio and analyze the video content automatically."}
                </p>
              </div>
            </div>
          )}

          {/* Caption field (for image/video) */}
          {(mediaType === "image" || mediaType === "video") && file && (
            <div className="space-y-2 animate-fade-in">
              <Label className="font-body text-sm font-medium">
                Ad caption / copy (optional)
              </Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                className="font-body resize-none"
                placeholder="Paste the ad caption or description text if available..."
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/${locale}/campaigns`}
            className="px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] font-body text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
          >
            {t("common.cancel")}
          </Link>
          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)] font-body font-medium"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}