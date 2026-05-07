import React from 'react';

interface EmptyStateActionObject {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactElement | EmptyStateActionObject;
}

function isActionObject(a: React.ReactElement | EmptyStateActionObject): a is EmptyStateActionObject {
  return typeof a === 'object' && 'label' in a && 'onClick' in a && !React.isValidElement(a);
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  // Resolve action element, injecting data-slot="button" to satisfy Button wrapper contract
  let actionElement: React.ReactElement;
  if (isActionObject(action)) {
    actionElement = (
      <button data-slot="button" onClick={action.onClick}>
        {action.label}
      </button>
    );
  } else {
    // Clone the passed element to add data-slot="button" marker
    actionElement = React.cloneElement(action as React.ReactElement<Record<string, unknown>>, {
      'data-slot': 'button',
    });
  }

  return (
    <div data-testid="empty-state-root" className="empty-state">
      <span data-testid="empty-state-icon" className="empty-state__icon">
        {icon}
      </span>
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__body">{body}</p>
      <div data-testid="empty-state-action" className="empty-state__action">
        {actionElement}
      </div>
    </div>
  );
}
