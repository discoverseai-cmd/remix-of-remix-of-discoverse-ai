import logo from "@/assets/discoverse-logo.png";

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Discoverse AI"
      className={className + " object-contain select-none"}
      draggable={false}
    />
  );
}