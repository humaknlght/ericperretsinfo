// Lazy-loaded view module for ?art. Imported on demand from
// script-of-awesomeness.ts so the homepage critical path doesn't pay for it.

interface DocumentWithFullscreen extends Document {
    webkitExitFullscreen?: () => Promise<void>;
}

interface HTMLElementWithFullscreen extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
}

export interface ViewState {
    originalMainHTML: string | null;
}

function artItemClickListener(a: Readonly<HTMLAnchorElement>): void {
    a.addEventListener("click", (event: MouseEvent) => {
        event.preventDefault();
        const docWithFullscreen = document as DocumentWithFullscreen;
        if (docWithFullscreen.fullscreenElement) {
            (docWithFullscreen.exitFullscreen ?? docWithFullscreen.webkitExitFullscreen)?.call(docWithFullscreen);
        } else {
            const targetEl = (event.currentTarget as HTMLElement).querySelector("img") as HTMLElementWithFullscreen;
            (targetEl.requestFullscreen ?? targetEl.webkitRequestFullscreen)?.call(targetEl);
        }
    });
}

export async function getAndLoadArt(state: ViewState): Promise<void> {
    try {
        const response = await fetch("/art/art.html");
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const text = await response.text();
        const content = document.querySelector<HTMLElement>(".content")!;
        const mainContent = content.querySelector<HTMLElement>("main")!;

        if (state.originalMainHTML === null) {
            state.originalMainHTML = mainContent.innerHTML;
        }

        content.classList.add("art");
        mainContent.innerHTML = text;
        document.querySelectorAll<HTMLAnchorElement>(".artContent a").forEach(artItemClickListener);

        // Move focus to the start of the new content so screen readers are aware of the change
        const firstFocusableArt = mainContent.querySelector<HTMLElement>("a, button, input, [tabindex]:not([tabindex='-1'])");
        if (firstFocusableArt) {
            requestAnimationFrame(() => {
                firstFocusableArt.focus();
                firstFocusableArt.scrollIntoView({ behavior: 'smooth' });
            });
        } else {
            content.tabIndex = -1;
            content.focus();
        }
    } catch (error) {
        console.error("Failed to load art content:", error);
    }
}
