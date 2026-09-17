/* Mouse-button routing. A gesture may become orbit, never become a throw. */
(function(I){'use strict';
function action(event,mode){
 if(![0,1,2].includes(event.button))return null;
 if(event.button===1||event.button===2||event.altKey||(event.buttons&6))return 'orbit';
 return ['feed','wind','orbit'].includes(mode)?mode:'orbit';
}
function advance(event,previous){
 if(previous==='orbit'||previous==='pinch')return previous;
 return event.altKey||(event.buttons&6)?'orbit':previous;
}
I.pointerInput={action,advance};
})(globalThis.Ignis=globalThis.Ignis||{});
