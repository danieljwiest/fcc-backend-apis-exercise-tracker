const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const assert = require('assert')

//connect to server
mongoose.connect(process.env.MONGO_URI, {useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true})
  .then(connection => {
  console.log('Connected to MongoDB DB')
  })
  .catch(error => {
  console.log(error.message)
  });

//Basic Configuration
app.use(cors())
app.use(express.static(__dirname + '/public'))
app.use(bodyParser.urlencoded({extended: false}));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})

//Create new schema for logging user exercises
const userSchema = new Schema({
  username: {type: String, unique: true, required: true},
  count: {type: Number, default: 0},
  log: [{type: Schema.Types.ObjectId, ref: 'exerciseLogs'}],
})

const exerciseLogSchema = new Schema({
  description: {type: String, required: true},
  duration: {type: Number, required: true},
  dateObj: {type: Date},
  date: {type: String}
})

let user = mongoose.model('exerciseAppUsers', userSchema)
let exerciseLog = mongoose.model('exerciseLogs', exerciseLogSchema)


//API Endpoints
app.post(
  '/api/users',
  handleNewUserReq
)

app.post(
  '/api/users/:_id/exercises',
  validateDateInput,
  handleExerciseLogPostReq
)

app.get(
  '/api/users',
  handleAllUsersReq
)

app.get(
  '/api/users/:_id/logs',
  handleExcerciseLogGetReq,
)

app.use(errorHandler)

//FUNCTIONS

function errorHandler (err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  console.log("in error handler, error is: ", err)
  res.status(500).send({ error: err })
}



//create new user in database and respond with username and ID
async function handleNewUserReq (req, res, next) {
  const username = req.body.username; 
  try{
    const newUserData = await createAndSaveUser(username);
    res.json({username: newUserData.username, _id: newUserData._id})
  } catch (err) {
    next(err)
  }
}

//Update the user exercise "count" and log the exercise
async function handleExerciseLogPostReq (req, res, next) {
  const userId = req.params._id
  const newExerciseLog = {
    description: req.body.description,
    duration: parseInt(req.body.duration),
    dateObj: req.body.date,
    date: req.body.date.toDateString()
  }  
  try{
    const newExerciseLogData = await createExerciseLog(newExerciseLog)
    const userData = await updateCountAndLogExercise(userId, newExerciseLogData._id);
    const currentLog = userData.log.pop();
    res.json({
      _id: userData._id, 
      username: userData.username, 
      date: currentLog.date, 
      duration: currentLog.duration, 
      description: currentLog.description
    });
  } catch (err) {
    next(err)
  }  
}

function validateDateInput (req, res, next) {
  const reqDate = req.body.date;
    
  //assign current date to logs that do not specify a date and move to next middleware
  if(reqDate === '' || reqDate === undefined) {
    req.body.date = new Date();
    return next();
  }
  //validate correct date format is used. Send error for invalid dates
  //This step filters out valid "DateStrings" that do not match the specified YYYY-MM-DD format
  const dateRegex = /^[0-9]{4}-(((0[13578]|(10|12))-(0[1-9]|[1-2][0-9]|3[0-1]))|(02-(0[1-9]|[1-2][0-9]))|((0[469]|11)-(0[1-9]|[1-2][0-9]|30)))$/  //Reggex to validate if date is strictly in YYYY-MM-DD format.
  const validDate = dateRegex.test(reqDate);
  if(!validDate) return next({error: 'Invalid Date Entry'})

  //move to next middleware if a valid date was entered
  req.body.date = new Date(reqDate);
  next();
}

async function handleAllUsersReq (req, res, next) {
  try{
    const allUsers = await returnAllUsers();
    res.send(allUsers)
  } catch (err) {
    next(err);
  }
}

async function handleExcerciseLogGetReq (req, res, next) {
  const userId = req.params._id;
  const query = req.query
  try{
    const userData = await returnUserExerciseLog(userId, query);
    res.json({
      _id: userData._id, 
      username: userData.username, 
      count: userData.count, 
      log: userData.log
    });
  } catch (err) {
    next(err);
  }
}

//MongoDB Functions

function createAndSaveUser (username) {
  const newUser = new user({username: username})
  return newUser.save();

}

//Creates an exercise log and returns the _id for the new log
function createExerciseLog(newExerciseLog) {
  const log = new exerciseLog(newExerciseLog);
  return log.save()
}


function updateCountAndLogExercise(userId, newExerciseLogId) {
  return user
      .findByIdAndUpdate(
        userId, 
        {$inc: {count: 1}, $push: {log: newExerciseLogId} },
        {new: true},
        )
      .populate('log')
      .exec()
};

function returnAllUsers() {
  return user
      .find({})
      .populate('log')
      .exec()
}

function returnUserExerciseLog(userId, queryFilters) {
  //assign query parameters to variables
  const queryLimit = queryFilters.limit ? queryFilters.limit : 0;
  const fromDate = queryFilters.from ? new Date(queryFilters.from) : 0;
  const toDate = queryFilters.to ? new Date(queryFilters.to) : Date.now();

  return user
      .findById(userId)
      .populate({
        path: 'log',
        match: {dateObj: {$gte: fromDate, $lte: toDate}},
        options: {limit: queryLimit}
        })
      .exec()
}


