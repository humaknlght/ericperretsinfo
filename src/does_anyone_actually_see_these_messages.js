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
            {num: 7 , className: "option2"}
        ];
    let bgImgIndex = randInt(8),
        colorOption,
        refresh = document.querySelector(".changeColor svg");
    function setBackground(options) {
        let background = document.querySelector(".background"),
            backgroundContent = "";
        for(let i = 0, numDivs = options.num * options.num; i < numDivs; i++) {
            backgroundContent += "<div><div></div></div>";
        }
        document.documentElement.style.setProperty("--gridRows", options.num);
        document.documentElement.style.setProperty("--bgUrl", `url(img/bg${bgImgIndex}.jpg)`);
        background.innerHTML = backgroundContent;
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
        switch(colorOption) {
            case 0:
                changeColor(event.currentTarget);
                break;
            case 1:
                changeColorGreyScale(event.currentTarget)
                break;
            case 2:
                changeColorInvert(event.currentTarget)
                break; 
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
    function setup() {
        const selOpt = backgroundOptions[randInt(2)];
        if (document.documentElement.clientWidth >= 675) {
            colorOption = randInt(3);
            setBackground(selOpt);
            const allSquares = document.querySelectorAll(".background > div"),
                selected = [];
            allSquares.forEach(el => {
                el.addEventListener("mouseover", changeColorFromEvent, false);
                el.addEventListener("click", changeColorFromEvent, false);
            });
            setInterval(function() {
                if (!document.hidden) {
                    let square;
                    do {
                        square = allSquares[randInt(allSquares.length)];
                    } while (!isInViewport(square))
                    if (selected.length >= 3) {
                        const removedItem = selected.shift();
                        removedItem.className = "";
                        removedItem.children[0].style.backgroundColor = "";
                    }
                    selected.push(square);
                    switch(colorOption) {
                        case 0:
                            changeColor(square);
                            break;
                        case 1:
                            changeColorGreyScale(square)
                            break;
                        case 2:
                            changeColorInvert(square)
                            break; 
                    }
                }
            }, 4000);
        } else {
            selOpt.num = 1;
            setBackground(selOpt);
        }
    }
    refresh.addEventListener("animationend", function () {
        refresh.classList.toggle("rotate");
    });
    window.addEventListener("DOMContentLoaded", () => {
        setup();
        document.querySelector(".navOpener > button").addEventListener("click", (button) => {
            button = button.currentTarget;
            button.classList.toggle("open");
            button.setAttribute("aria-expanded", (button.getAttribute("aria-expanded") === "false"));
            document.querySelector(".navHolder").classList.toggle("open")
        });
        document.querySelector(".changeColor button").addEventListener("click", (buton) => {
            refresh.classList.toggle("rotate");
            document.querySelector(".background").className = "grid background";
            document.querySelector(".clip-text").className = "clip-text";
            let newBgImgIndex;
            do {
                newBgImgIndex = randInt(8);
            } while(bgImgIndex === newBgImgIndex);
            bgImgIndex = newBgImgIndex;
            setup();
        });
        document.querySelector("#me").addEventListener("click", (link) => {
            link = link.currentTarget;
            let div = document.createElement("div");
            div.className = "me";
            div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/wZZ7oFKsKzY?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
            link.parentNode.replaceChild(div, link);
        });
        let httpRequest;
        function getAndLoadArt() {
            httpRequest = new XMLHttpRequest();

            if (!httpRequest) {
                alert("Giving up :( Cannot create an XMLHTTP instance");
                return false;
            }
            httpRequest.onreadystatechange = swapContents;
            httpRequest.open("GET", "art/");
            httpRequest.send();
        }
        document.querySelector("a.art").addEventListener("click", (event) => {
            event.preventDefault();
            getAndLoadArt();
        });

        function swapContents() {
            if (httpRequest.readyState === XMLHttpRequest.DONE) {
                if (httpRequest.status === 200) {
                    let content = document.querySelector(".content");
                    content.style.height = "1079rem";
                    content.querySelector("main").innerHTML = httpRequest.responseText;
                } else {
                    alert("There was a problem with the request. :-(");
                }
            }
        }
        if (window.location.search === "?art") {
            getAndLoadArt();
        }
    });
    window.ga=function(){(ga.q=ga.q||[]).push(arguments)};ga.l=+new Date;
    ga("create","UA-39357422-1","auto");
    ga("send","pageview");
}