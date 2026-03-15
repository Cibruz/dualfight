let mode = ""

let player1
let player2

let player1Move = null
let player2Move = null


function createPlayer(){

return{
lives:3,
bullets:0,
shields:3
}

}


function startGame(selectedMode){

mode = selectedMode

player1 = createPlayer()
player2 = createPlayer()

document.getElementById("menu").style.display="none"
document.getElementById("game").style.display="block"

if(mode === "local"){
document.getElementById("enemyTitle").innerText="Player 2"
}

updateUI()

startRound()

}



function startRound(){

player1Move = null
player2Move = null

let count = 3

let timer = setInterval(()=>{

document.getElementById("countdown").innerText = count

count--

if(count < 0){

clearInterval(timer)

document.getElementById("countdown").innerText="DRAW!"

setTimeout(resolveRound,1000)

}

},1000)

}



function chooseMove(move){

if(mode === "ai"){

player1Move = move
player2Move = aiMove()

}

else if(mode === "local"){

if(player1Move === null){

player1Move = move
document.getElementById("result").innerText="Player 1 locked move"

}

else{

player2Move = move
document.getElementById("result").innerText="Player 2 locked move"

}

}

}



function aiMove(){

let moves = ["shoot","reload","defend"]

return moves[Math.floor(Math.random()*3)]

}



function resolveRound(){

if(player1Move === null) player1Move = "reload"
if(player2Move === null) player2Move = "reload"

applyRules(player1Move, player2Move)

updateUI()

checkWinner()

setTimeout(startRound,2000)

}



function applyRules(p1,p2){

let text=""

if(p1==="shoot" && player1.bullets>0) player1.bullets--
if(p2==="shoot" && player2.bullets>0) player2.bullets--

if(p1==="reload") player1.bullets++
if(p2==="reload") player2.bullets++

if(p1==="shoot" && p2==="shoot"){
player1.lives--
player2.lives--
text="Both got shot!"
}

else if(p1==="shoot" && p2==="reload"){
player2.lives--
text="Player 2 got shot!"
}

else if(p2==="shoot" && p1==="reload"){
player1.lives--
text="Player 1 got shot!"
}

else if(p1==="shoot" && p2==="defend" && player2.shields>0){
player2.shields--
text="Player 2 blocked!"
}

else if(p2==="shoot" && p1==="defend" && player1.shields>0){
player1.shields--
text="Player 1 blocked!"
}

else{
text="Nothing happened"
}

document.getElementById("result").innerText=text

}



function updateUI(){

document.getElementById("p1Lives").innerText="❤️".repeat(player1.lives)
document.getElementById("p2Lives").innerText="❤️".repeat(player2.lives)

document.getElementById("p1Bullets").innerText=player1.bullets
document.getElementById("p2Bullets").innerText=player2.bullets

document.getElementById("p1Shields").innerText=player1.shields
document.getElementById("p2Shields").innerText=player2.shields

}



function checkWinner(){

if(player1.lives <=0){

alert("Player 2 Wins 🤠")
location.reload()

}

if(player2.lives <=0){

alert("Player 1 Wins 🎉")
location.reload()

}

}