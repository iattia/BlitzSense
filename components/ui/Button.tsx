import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) => {
  const baseStyles = "font-bold rounded-md transition-colors duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-50 disabled:cursor-not-allowed disabled:active:scale-100";

  const variants = {
    primary: "bg-stone-800 hover:bg-stone-700 text-white focus:ring-stone-400 disabled:bg-stone-300 disabled:text-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:disabled:bg-stone-700 dark:disabled:text-stone-500",
    secondary: "bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 focus:ring-stone-300 dark:bg-stone-800 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-700",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
