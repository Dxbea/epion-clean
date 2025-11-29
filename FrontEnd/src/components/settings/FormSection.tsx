import React from "react";
import { H3, Body } from "@/components/ui/Typography";

type Props = {
  id?: string;                 // ✅ new (anchor id)
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;    // optional
  className?: string;          // optional extra classes
};

export default function FormSection({ id, title, description, children, footer, className = "" }: Props) {
  return (
    <section id={id} className={`anchor-section rounded-2xl border border-surface-200 bg-white p-5 shadow-soft dark:border-neutral-800 dark:bg-neutral-950 ${className}`}>
      <div className="mb-4">
        <H3 as="div" className="text-lg">{title}</H3>
        {description && <Body className="mt-1">{description}</Body>}
      </div>
      <div>{children}</div>
      {footer && <div className="mt-4 flex items-center justify-end">{footer}</div>}
    </section>
  );
}