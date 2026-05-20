import React from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card"
      className={['card', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={['card__header', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={['card__title', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: DivProps) {
  return (
    <p
      data-slot="card-description"
      className={['card__description', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-content"
      className={['card__content', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={['card__footer', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
