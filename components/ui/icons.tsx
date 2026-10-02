import type { ReactNode, SVGProps } from "react";

/**
 * Hand-rolled 16px stroke icons (24-unit viewBox, currentColor).
 * Usage: <IconPlay size={14} className="text-fg-muted" />
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  /** Accessible label. When omitted the icon is aria-hidden. */
  title?: string;
}

function make(name: string, body: ReactNode, opts: { fill?: boolean } = {}) {
  function Icon({ size = 16, title, strokeWidth = 1.75, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? "currentColor" : "none"}
        stroke={opts.fill ? "none" : "currentColor"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {body}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const IconPlay = make("IconPlay", <path d="M7 4.5v15l12.5-7.5z" />);
export const IconStop = make("IconStop", <rect x="6" y="6" width="12" height="12" rx="1.5" />);
export const IconPlus = make("IconPlus", <path d="M12 5v14M5 12h14" />);
export const IconMinus = make("IconMinus", <path d="M5 12h14" />);
export const IconX = make("IconX", <path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = make("IconCheck", <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconCopy = make(
  "IconCopy",
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </>,
);
export const IconChevronDown = make("IconChevronDown", <path d="M6 9l6 6 6-6" />);
export const IconChevronRight = make("IconChevronRight", <path d="M9 6l6 6-6 6" />);
export const IconChevronLeft = make("IconChevronLeft", <path d="M15 6l-6 6 6 6" />);
export const IconArrowRight = make("IconArrowRight", <path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowUpRight = make("IconArrowUpRight", <path d="M7 17L17 7M8 7h9v9" />);
export const IconSearch = make(
  "IconSearch",
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </>,
);
export const IconSun = make(
  "IconSun",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </>,
);
export const IconMoon = make("IconMoon", <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
export const IconMonitor = make(
  "IconMonitor",
  <>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </>,
);
export const IconMenu = make("IconMenu", <path d="M4 7h16M4 12h16M4 17h16" />);
export const IconExternal = make(
  "IconExternal",
  <>
    <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </>,
);
export const IconBolt = make("IconBolt", <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />);
export const IconClock = make(
  "IconClock",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const IconCoins = make(
  "IconCoins",
  <>
    <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
    <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
    <path d="M9.5 16.3c.9.1 1.9.2 3 .2 3.6 0 6.5-1.1 6.5-2.5v-4" />
    <path d="M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5" />
  </>,
);
export const IconGauge = make(
  "IconGauge",
  <>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="M12 13l4-4.5" />
    <circle cx="12" cy="13.5" r="1.2" />
  </>,
);
export const IconRoute = make(
  "IconRoute",
  <>
    <circle cx="5.5" cy="12" r="2" />
    <circle cx="18.5" cy="5.5" r="2" />
    <circle cx="18.5" cy="12" r="2" />
    <circle cx="18.5" cy="18.5" r="2" />
    <path d="M7.5 12h9M7.2 11c3-4.5 5-5.5 9.3-5.5M7.2 13c3 4.5 5 5.5 9.3 5.5" />
  </>,
);
export const IconLayout = make(
  "IconLayout",
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>,
);
export const IconTerminal = make(
  "IconTerminal",
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M7 9.5l3 2.5-3 2.5M12.5 15H17" />
  </>,
);
export const IconFlask = make(
  "IconFlask",
  <>
    <path d="M9.5 3.5h5M10 3.5v5.5L4.8 18a1.8 1.8 0 0 0 1.6 2.6h11.2a1.8 1.8 0 0 0 1.6-2.6L14 9V3.5" />
    <path d="M7.5 14.5h9" />
  </>,
);
export const IconList = make(
  "IconList",
  <>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.5" cy="6.5" r=".8" />
    <circle cx="4.5" cy="12" r=".8" />
    <circle cx="4.5" cy="17.5" r=".8" />
  </>,
);
export const IconTrophy = make(
  "IconTrophy",
  <>
    <path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0z" />
    <path d="M16.5 6.5h3a3 3 0 0 1-3 4M7.5 6.5h-3a3 3 0 0 0 3 4M12 14v3.5M8.5 20.5h7M9.5 17.5h5" />
  </>,
);
export const IconServer = make(
  "IconServer",
  <>
    <rect x="3.5" y="4" width="17" height="7" rx="1.8" />
    <rect x="3.5" y="13" width="17" height="7" rx="1.8" />
    <path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h6M11 16.5h6" />
  </>,
);
export const IconBook = make(
  "IconBook",
  <>
    <path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h13v14h-13a2 2 0 0 0-2 2z" />
    <path d="M4.5 19.5a2 2 0 0 0 2 2h13v-4M9 8h6.5" />
  </>,
);
export const IconHistory = make(
  "IconHistory",
  <>
    <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" />
    <path d="M4 4v4.7h4.7M12 8v4.2l3 1.8" />
  </>,
);
export const IconSliders = make(
  "IconSliders",
  <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1M15 4.5v4M9 10v4M17 15.5v4" />,
);
export const IconEye = make(
  "IconEye",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const IconEyeOff = make(
  "IconEyeOff",
  <>
    <path d="M10 5.7c.6-.1 1.3-.2 2-.2 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.2" />
    <path d="M9.9 10a2.8 2.8 0 0 0 4 4M3.5 3.5l17 17" />
  </>,
);
export const IconDice = make(
  "IconDice",
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r=".9" fill="currentColor" />
    <circle cx="15" cy="15" r=".9" fill="currentColor" />
    <circle cx="15" cy="9" r=".9" fill="currentColor" />
    <circle cx="9" cy="15" r=".9" fill="currentColor" />
  </>,
);
export const IconAlert = make(
  "IconAlert",
  <>
    <path d="M10.3 4.2L2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </>,
);
export const IconInfo = make(
  "IconInfo",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8h.01" />
  </>,
);
export const IconCheckCircle = make(
  "IconCheckCircle",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
  </>,
);
export const IconXCircle = make(
  "IconXCircle",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
  </>,
);
export const IconGithub = make(
  "IconGithub",
  <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6 0-.6 0-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.3 4.5-4.4 4.7.3.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z" />,
  { fill: true },
);
export const IconCommand = make(
  "IconCommand",
  <path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h-6m6 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15zm-6 0v2.5A2.5 2.5 0 1 1 6.5 15H9z" />,
);
export const IconRefresh = make(
  "IconRefresh",
  <>
    <path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6" />
    <path d="M18.5 3.5v4.2h-4.2M5.5 20.5v-4.2h4.2" />
  </>,
);
export const IconTrash = make(
  "IconTrash",
  <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13M10 10.5v6M14 10.5v6" />,
);
export const IconThumbUp = make(
  "IconThumbUp",
  <path d="M7.5 10.5v9.5h-3v-9.5zM7.5 10.5l3.6-6.3a1.6 1.6 0 0 1 3 .9l-.6 4.4h5a1.8 1.8 0 0 1 1.8 2.1l-1.2 6.6a2 2 0 0 1-2 1.8H7.5" />,
);
export const IconThumbDown = make(
  "IconThumbDown",
  <path d="M16.5 13.5V4h3v9.5zM16.5 13.5l-3.6 6.3a1.6 1.6 0 0 1-3-.9l.6-4.4h-5a1.8 1.8 0 0 1-1.8-2.1l1.2-6.6a2 2 0 0 1 2-1.8h9.6" />,
);
export const IconEqual = make("IconEqual", <path d="M5.5 9.5h13M5.5 14.5h13" />);
export const IconSparkles = make(
  "IconSparkles",
  <path d="M11 3.5l1.6 4.4L17 9.5l-4.4 1.6L11 15.5l-1.6-4.4L5 9.5l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />,
);
export const IconKey = make(
  "IconKey",
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
  </>,
);
export const IconActivity = make("IconActivity", <path d="M3 12h4l2.5-6.5 5 13L17 12h4" />);
export const IconCpu = make(
  "IconCpu",
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx=".8" />
    <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
  </>,
);
export const IconSigma = make("IconSigma", <path d="M17.5 5.5V4h-11l6 8-6 8h11v-1.5" />);
export const IconHome = make(
  "IconHome",
  <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19z" />,
);
export const IconDownload = make("IconDownload", <path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" />);
export const IconHash = make("IconHash", <path d="M9.5 4l-2 16M16.5 4l-2 16M4.5 9h15M3.5 15h15" />);
export const IconFile = make(
  "IconFile",
  <>
    <path d="M13.5 3.5h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z" />
    <path d="M13.5 3.5v5h5" />
  </>,
);
export const IconDot = make("IconDot", <circle cx="12" cy="12" r="4" />, { fill: true });
