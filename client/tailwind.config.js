/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts,scss}"],
  theme: {
    // Section 3.1: Mobile (<768px) / Tablet (768px-1024px) / Desktop (>1024px)
    // Tailwind mặc định: sm=640, md=768, lg=1024, xl=1280.
    // Ta dùng đúng md (768px) làm biên Mobile->Tablet và lg (>1024px) làm biên
    // Tablet->Desktop để khớp chính xác với SRS thay vì bịa breakpoint riêng.
    screens: {
      sm: "640px", // (tuỳ chọn - phụ trợ cho fine-tuning trong khoảng mobile)
      md: "768px", // >= 768px: bắt đầu vùng Tablet
      lg: "1025px", // > 1024px: bắt đầu vùng Desktop
      xl: "1280px",
    },
    extend: {
      spacing: {
        11: "2.75rem", // 44px - dùng cho min-h-11/min-w-11 (NFR-UX-02 hit target)
      },
      colors: {
        // Medical Clean UI (Section 3.1) - palette trung tính + accent xanh y tế
        sky: {
          50: "#f0f9ff",
          600: "#0284c7",
          700: "#0369a1",
        },
      },
    },
  },
  plugins: [],
};
