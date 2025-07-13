"use client";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import Image from "next/image";
import React from "react";

interface ImageModalProps {
  src: string;
  children: React.ReactNode;
}

export default function ImageModal({ src, children }: ImageModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="p-0 w-[90vw] max-w-3xl flex items-center justify-center">
        <div className="relative w-full h-[90vh]">
          <Image src={src} alt="image" fill className="object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
