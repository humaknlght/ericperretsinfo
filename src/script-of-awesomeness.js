"use strict";
{
    function randInt(max) {
        return Math.floor(Math.random() * max);
    }
    const backgoundTheme = [
            "#232323", "#969ab2",
            "#52504d", "##e3c6b0",
            "#f8a688", "#707885"
        ],
        colors = ["orange", "blue", "grey", "hide", "pattern", ""],
        backgroundOptions = [
            {num: 36, className: "option1"},
            {num: 7 , className: "option2"},
            {num: 36, className: "option3"}
        ];
    let bgImgIndex = randInt(8),
        colorOption,
        refresh = document.querySelector(".changeColor svg");
    function setBackground(options) {
        const background = document.querySelector(".background");
        document.documentElement.style.setProperty("--gridRows", options.num);
        document.documentElement.style.setProperty("--bgUrl", `url(img/bg${bgImgIndex}.webp)`);
        background.innerHTML = new Array(options.num * options.num).fill("<div><div></div></div>").join("");
        background.classList.add(options.className);
        let metaThemeColor = document.querySelector("meta[name=theme-color]");
        metaThemeColor.setAttribute("content", backgoundTheme[bgImgIndex]);
    }
    function changeColor(targetEl, allowDupes) {
        let newColor;
        do {
            let rand = randInt(8);
            newColor = colors[(rand === 6) ? 4 : rand];
        } while((newColor === targetEl.className) && !allowDupes);

        targetEl.className = newColor;
    }
    function changeColorGreyScale(targetEl, allowDupes) {
        let newColor,
            el = targetEl.children[0];
        do {
            newColor = ((randInt(2) === 0) ? "rgba(0,0,0," : "rgba(255,255,255,") + (randInt(8) / 10) + ")";
        } while((newColor === el.style.backgroundColor) && !allowDupes);

        el.style.backgroundColor = newColor;
    }
    function changeColorInvert(targetEl) {
        targetEl.classList.toggle("invert");
    }
    function changeColorFromEvent(event) {
        const div = event.target.parentElement;
        if (!div.classList.contains("backgroundWrapper")) {
            switch(colorOption) {
                case 0:
                    changeColor(div);
                    break;
                case 1:
                    changeColorGreyScale(div);
                    break;
                case 2:
                    changeColorInvert(div);
                    break; 
            }
        }
    }
    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
    let snakeIntervalId;
    function setupSnake() {
        function isDivHiddenOnScreen(div) {
            if (!div) {
                return true;
            }
            const rect = div.getBoundingClientRect();
            return !(
                rect.top >= 0
                && rect.left >= 0
                && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
                && rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        }
        function alreadyContains(classes) {
            return !classes || classes.contains("bottom") || classes.contains("right") || classes.contains("top") || classes.contains("left");
        }
        setBackground(backgroundOptions[2]);
        const background = document.querySelector(".background");
        const items = background.querySelectorAll("div > div > div > div");
        let index = randInt(items.length);
        document.querySelector(".content").scrollIntoView({behavior: "smooth"});
        snakeIntervalId = setInterval(() => {
            let direction = randInt(4);
            let clazz;
            for (var i = 4; i >= 0; i--) {
                if (direction === 0) {
                    if (isDivHiddenOnScreen(items[index - 1]) || alreadyContains(items[index - 1]?.classList)) {
                        direction = 3;
                        continue;
                    }
                    index--;
                    clazz = "bottom";
                } else if (direction === 1) {
                    if (isDivHiddenOnScreen(items[index + 36]) || alreadyContains(items[index + 36]?.classList)) {
                        direction = 0;
                        continue;
                    }
                    index += 36;
                    clazz = "right";
                } else if (direction === 2) {
                    if (isDivHiddenOnScreen(items[index + 1]) || alreadyContains(items[index + 1]?.classList)) {
                        direction = 1;
                        continue;
                    }
                    index++;
                    clazz = "top";
                } else if (direction === 3) {
                    if (isDivHiddenOnScreen(items[index - 36]) || alreadyContains(items[index - 36]?.classList)) {
                        direction = 2;
                        continue;
                    }
                    index -= 36;
                    clazz = "left";
                }
                items[index].classList.add(clazz);
                break;
            }
            if (i < 0) {
                index = randInt(items.length);
            }
        }, 200);
    }
    function setup() {
        const selOpt = backgroundOptions[randInt(2)];
        if (document.documentElement.clientWidth >= 675) {
            colorOption = randInt(3);
            setBackground(selOpt);
            const background = document.querySelector(".background");
            background.addEventListener("mouseover", changeColorFromEvent, false);
            background.addEventListener("click", changeColorFromEvent, false);
        } else {
            selOpt.num = 1;
            setBackground(selOpt);
        }
    }
    refresh.addEventListener("animationend", function () {
        refresh.classList.toggle("rotate");
    });
    window.addEventListener("DOMContentLoaded", () => {
        function changeBackground(isRefresh) {
            clearInterval(snakeIntervalId);
            isRefresh && refresh.classList.toggle("rotate");
            document.querySelector(".background").className = "grid background";
            const background = document.querySelector(".background");
            background.removeEventListener("mouseover", changeColorFromEvent, false);
            background.removeEventListener("click", changeColorFromEvent, false);
            let newBgImgIndex;
            do {
                newBgImgIndex = randInt(8);
            } while(bgImgIndex === newBgImgIndex);
            bgImgIndex = newBgImgIndex;
            isRefresh ? setup() : setupSnake();
        }
        setup();
        document.querySelector(".navOpener > button").addEventListener("click", (button) => {
            button = button.currentTarget;
            button.classList.toggle("open");
            button.setAttribute("aria-expanded", (button.getAttribute("aria-expanded") === "false"));
            document.querySelector(".navHolder").classList.toggle("open")
        });
        document.querySelector(".changeColor > #refresh").addEventListener("click", (button) => {
            changeBackground(true);
        });
        document.querySelector(".changeColor > #🐍").addEventListener("click", (button) => {
            changeBackground();
        });
        document.querySelector("#me").addEventListener("click", (link) => {
            link = link.currentTarget;
            const div = document.createElement("div");
            div.className = "me";
            div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/EErY75MXYXI?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
            link.parentNode.replaceChild(div, link);
        });
        async function getAndLoadArt() {
            const response = await fetch("art/");
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            const text = await response.text();
            const content = document.querySelector(".content");
            content.classList.add("art");
            content.querySelector("main").innerHTML = text;
        }
        document.querySelector("a.art").addEventListener("click", (event) => {
            event.preventDefault();
            getAndLoadArt();
        });
        if (window.location.search === "?art") {
            getAndLoadArt();
        }
    });
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'UA-39357422-1');
}