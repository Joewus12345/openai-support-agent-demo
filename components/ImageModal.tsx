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
        <Image src={src} alt="image" className="max-h-[90vh] w-auto h-auto object-contain" />
      </DialogContent>
    </Dialog>
  );
}
