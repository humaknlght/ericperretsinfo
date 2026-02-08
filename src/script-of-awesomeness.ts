// --- Type Definitions for Browser/External APIs ---

// Extend the global Window interface to let TypeScript know about Google Analytics functions.
interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
}

// Create custom interfaces for the Fullscreen API to handle vendor prefixes for
// browsers like Safari.
interface DocumentWithFullscreen extends Document {
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
}

interface HTMLElementWithFullscreen extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
}

{
    // --- Global State Variables ---

    // It's good practice to define the types of our state variables.
    // 'ReturnType<typeof setInterval>' is a robust way to type interval IDs.
    let originalSlides: number;
    let currentIndex: number = 1; // Start at index 1 to show the first original image
    let backgroundInterval: ReturnType<typeof setInterval> | undefined;
    let animateCarousel: () => void;


    // --- Utility Functions ---

    /**
     * Sets the background image for the document.
     * @param {number} index The index of the background image.
     * @param {HTMLElement} carouselContainer The container element for the carousel.
     * @param {boolean} enableTransition Whether to animate the slide (true) or jump instantly (false).
     */
    function setBackgroundImg(index: number, carouselContainer: Readonly<HTMLElement>, enableTransition: boolean = true): void {
        // The offset is calculated based on the full viewport width of 100vw
        const offset = (-index * 90) + 5;

        // Toggle transition based on the flag
        carouselContainer.style.transition = enableTransition ? 'transform 1.5s ease-in-out' : 'none';
        carouselContainer.style.transform = `translateX(${offset}vw)`;
    }

    // --- Setup and Event Initialization ---

    /**
     * Sets up the carousel animation and its event listeners.
     */
    function setup(): void {
        const carouselContainer = document.querySelector<HTMLElement>(".carousel-container")!;
        const slides = document.querySelectorAll(".carousel-slide");
        const totalSlides = slides.length;
        originalSlides = totalSlides - 2;

        animateCarousel = () => {
            currentIndex++;
            setBackgroundImg(currentIndex, carouselContainer);
        };

        carouselContainer.addEventListener('transitionend', () => {
            // If we've reached the duplicated last slide, instantly reset to the first original slide
            if (currentIndex >= originalSlides + 1) {
                currentIndex = 1;
                // false = Jump instantly back to start (no animation)
                setBackgroundImg(currentIndex, carouselContainer, false);
            }
        });

        // Set an interval to trigger the next slide every 7 seconds
        // Only if the user hasn't requested reduced motion
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (!mediaQuery.matches) {
            backgroundInterval = setInterval(animateCarousel, 7000);
        }
    }

    /**
     * Adds a click listener to an art item to toggle fullscreen view.
     * @param {HTMLAnchorElement} a The anchor element wrapping the art item.
     */
    function artItemClickListener(a: Readonly<HTMLAnchorElement>): void {
        a.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();

            // Use our custom interface for the document
            const docWithFullscreen = document as DocumentWithFullscreen;

            // Check if fullscreen is currently active
            if (docWithFullscreen.fullscreenElement) {
                // If fullscreen, exit it
                if (docWithFullscreen.exitFullscreen) {
                    docWithFullscreen.exitFullscreen();
                } else if (docWithFullscreen.webkitExitFullscreen) { // Safari
                    docWithFullscreen.webkitExitFullscreen();
                }
            } else {
                const target = (event.currentTarget as HTMLElement).querySelector("img");
                // Check if the image target exists before trying to use it
                const targetEl = target as HTMLElementWithFullscreen;
                // If not fullscreen, request it for the image
                if (targetEl.requestFullscreen) {
                    targetEl.requestFullscreen();
                } else if (targetEl.webkitRequestFullscreen) { // Safari
                    targetEl.webkitRequestFullscreen();
                }
            }
        });
    }

    /**
     * Fetches and loads the art content into the page.
     */
    async function getAndLoadArt(): Promise<void> {
        try {
            const response = await fetch("art/");
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            const text = await response.text();
            const content = document.querySelector<HTMLElement>(".content")!;
            const mainContent = content.querySelector<HTMLElement>("main")!;

            content.classList.add("art");
            mainContent.innerHTML = text;
            document.querySelectorAll<HTMLAnchorElement>(".artContent>a").forEach(artItemClickListener);

            // Move focus to the start of the new content so screen readers are aware of the change
            const firstFocusableArt = mainContent.querySelector<HTMLElement>("a, button, input, [tabindex]:not([tabindex='-1'])");
            if (firstFocusableArt) {
                firstFocusableArt.focus();
            } else {
                // Fallback: focus the container if no interactive elements exist yet
                content.tabIndex = -1;
                content.focus();
            }

        } catch (error) {
            console.error("Failed to load art content:", error);
        }
    }


    // --- Document Ready / Main Execution ---

    /**
     * Main function to run when the DOM is ready.
     */
    function ready(): void {
        setup();

        const navOpenerButton = document.querySelector<HTMLButtonElement>(".navOpener > button")!;
        navOpenerButton.addEventListener("click", (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            button.classList.toggle("open");
            const isExpanded = button.getAttribute("aria-expanded") === "true";
            button.setAttribute("aria-expanded", isExpanded ? "false" : "true");
            document.querySelector(".navHolder")!.classList.toggle("open");
        });

        const meLink = document.querySelector<HTMLAnchorElement>("#me")!;
        meLink.addEventListener("click", (event) => {
            const link = event.currentTarget as HTMLAnchorElement;
            const div = document.createElement("div");
            div.className = "me";
            div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/EErY75MXYXI?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
            link.parentNode?.replaceChild(div, link);

            // Move focus to the iframe so keyboard users can interact with the video immediately
            const iframe = div.querySelector("iframe");
            if (iframe) {
                iframe.focus();
            }
        });

        document.querySelector<HTMLAnchorElement>("a.art")!.addEventListener("click", (event) => {
            event.preventDefault();
            getAndLoadArt();
        });

        document.querySelector<HTMLAnchorElement>("a.photos")!.addEventListener("click", (event) => {
            event.preventDefault();
            if (backgroundInterval) {
                clearInterval(backgroundInterval);
            }
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            document.body.classList.remove("show");
            document.body.classList.add("hide");
            document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.tabIndex = -1);
            document.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.removeAttribute("tabIndex"));

            const rightButton = document.querySelector<HTMLButtonElement>(".photoB>.r")!;
            rightButton.disabled = (currentIndex === originalSlides);

            const leftButton = document.querySelector<HTMLButtonElement>(".photoB>.l")!;
            leftButton.disabled = (currentIndex === 1);
        });

        const photoControls = document.querySelector(".photoB");
        if (photoControls) {
            photoControls.querySelector(".x")!.addEventListener("click", (event) => {
                event.preventDefault();
                // Reset the interval
                backgroundInterval = setInterval(animateCarousel, 7000);
                document.body.classList.remove("hide");
                document.body.classList.add("show");
                document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.removeAttribute("tabIndex"));
                // Only disable the photo control buttons, don't disable all buttons (navOpener)
                document.querySelectorAll<HTMLButtonElement>(".photoB > button").forEach(b => b.tabIndex = -1);

                // Restore focus to the photos link for better keyboard flow
                document.querySelector<HTMLElement>("a.photos")?.focus();
            });

            const carouselContainer = document.querySelector<HTMLElement>(".carousel-container")!;
            photoControls.querySelector<HTMLButtonElement>(".l")?.addEventListener("click", (event) => {
                event.preventDefault();
                setBackgroundImg(--currentIndex, carouselContainer);
                const targetButton = event.currentTarget as HTMLButtonElement;
                if (currentIndex === 1) {
                    targetButton.disabled = true;
                }
                const rightButton = photoControls.querySelector<HTMLButtonElement>(".r")!;
                rightButton.disabled = false;
            });

            photoControls.querySelector<HTMLButtonElement>(".r")!.addEventListener("click", (event) => {
                event.preventDefault();
                setBackgroundImg(++currentIndex, carouselContainer);
                const targetButton = event.currentTarget as HTMLButtonElement;
                if (currentIndex === originalSlides) {
                    targetButton.disabled = true;
                }
                const leftButton = photoControls.querySelector<HTMLButtonElement>(".l")!;
                leftButton.disabled = false;
            });
        }

        if (window.location.search === "?art") {
            getAndLoadArt();
        }
    }

    // --- Initialization Logic ---

    // Check document readiness and call the main function.
    switch (document.readyState) {
        case "interactive":
        case "complete":
            ready();
            break;
        default:
            window.addEventListener("DOMContentLoaded", ready);
    }

    // --- Google Analytics ---

    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) { window.dataLayer.push(args); }
    gtag('js', new Date());
    gtag('config', 'UA-39357422-1');
}