        document.addEventListener('DOMContentLoaded', function() {
            // Form elements
            const questionsContainer = document.querySelector('.questions-container');
            const progressBar = document.getElementById('progress');
            const progressPercentage = document.getElementById('progress-percentage');
            const currentStep = document.getElementById('current-step');
            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');
            const dashboardBtn = document.getElementById('dashboard-btn');
            const completionMessage = document.getElementById('completion-message');
            
            // Form state
            let currentQuestion = 1;
            const totalQuestions = 4; // For demo purposes, using 4 questions
            const formData = {};
            
            // Initialize the form
            updateProgress();
            
            // Navigation buttons
            prevBtn.addEventListener('click', goToPreviousQuestion);
            nextBtn.addEventListener('click', goToNextQuestion);
            dashboardBtn.addEventListener('click', function() {
                alert('Redirecting to dashboard...');
                // In a real app: window.location.href = '/dashboard';
            });
            
            // Option selection
            document.querySelectorAll('.option').forEach(option => {
                option.addEventListener('click', function() {
                    // Deselect all other options in the same question
                    const parentQuestion = this.closest('.question');
                    parentQuestion.querySelectorAll('.option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    
                    // Select this option
                    this.classList.add('selected');
                    
                    // Store the selected value
                    const questionId = parentQuestion.id;
                    formData[questionId] = this.getAttribute('data-value');
                    
                    // Enable next button if it's disabled
                    if (nextBtn.disabled) {
                        nextBtn.disabled = false;
                    }
                });
            });
            
            // Checkbox selection
            document.querySelectorAll('.checkbox-item').forEach(item => {
                item.addEventListener('click', function() {
                    this.classList.toggle('selected');
                    
                    const checkbox = this.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                    
                    // Store the selected values
                    const questionId = this.closest('.question').id;
                    if (!formData[questionId]) {
                        formData[questionId] = [];
                    }
                    
                    const value = this.getAttribute('data-value');
                    if (checkbox.checked) {
                        if (!formData[questionId].includes(value)) {
                            formData[questionId].push(value);
                        }
                    } else {
                        formData[questionId] = formData[questionId].filter(v => v !== value);
                    }
                    
                    // Enable next button if at least one checkbox is selected
                    const selectedCheckboxes = this.closest('.question').querySelectorAll('.checkbox-item.selected');
                    if (selectedCheckboxes.length > 0 && nextBtn.disabled) {
                        nextBtn.disabled = false;
                    } else if (selectedCheckboxes.length === 0) {
                        nextBtn.disabled = true;
                    }
                });
            });
            
            // Navigation functions
            function goToPreviousQuestion() {
                if (currentQuestion > 1) {
                    const currentQuestionElem = document.getElementById(`q${currentQuestion}`);
                    currentQuestionElem.classList.remove('active');
                    currentQuestionElem.classList.add('previous');
                    
                    currentQuestion--;
                    
                    const prevQuestionElem = document.getElementById(`q${currentQuestion}`);
                    prevQuestionElem.classList.remove('previous');
                    prevQuestionElem.classList.add('active');
                    
                    updateProgress();
                    
                    // Enable next button
                    nextBtn.disabled = false;
                    nextBtn.textContent = currentQuestion === totalQuestions ? 'Submit' : 'Next';
                    
                    // Show/hide previous button
                    if (currentQuestion === 1) {
                        prevBtn.disabled = true;
                    }
                }
            }
            
            function goToNextQuestion() {
                // Validate current question
                if (!validateQuestion(currentQuestion)) {
                    alert('Please select an option before continuing.');
                    return;
                }
                
                if (currentQuestion < totalQuestions) {
                    const currentQuestionElem = document.getElementById(`q${currentQuestion}`);
                    currentQuestionElem.classList.remove('active');
                    currentQuestionElem.classList.add('previous');
                    
                    currentQuestion++;
                    
                    const nextQuestionElem = document.getElementById(`q${currentQuestion}`);
                    nextQuestionElem.classList.remove('previous');
                    nextQuestionElem.classList.add('active');
                    
                    updateProgress();
                    
                    // Enable previous button
                    prevBtn.disabled = false;
                    
                    // Update next button text
                    nextBtn.textContent = currentQuestion === totalQuestions ? 'Submit' : 'Next';
                    
                    // Disable next button until an option is selected
                    nextBtn.disabled = true;
                } else {
                    // Submit the form
                    submitQuestionnaire();
                }
            }
            
            function validateQuestion(questionNum) {
                const question = document.getElementById(`q${questionNum}`);
                
                // For single-select questions
                const selectedOption = question.querySelector('.option.selected');
                if (selectedOption) {
                    return true;
                }
                
                // For multi-select questions
                const selectedCheckboxes = question.querySelectorAll('.checkbox-item.selected');
                if (selectedCheckboxes.length > 0) {
                    return true;
                }
                
                return false;
            }
            
            function updateProgress() {
                const progressPercentageValue = Math.round((currentQuestion / totalQuestions) * 100);
                progressBar.style.width = `${progressPercentageValue}%`;
                progressPercentage.textContent = `${progressPercentageValue}%`;
                currentStep.textContent = currentQuestion;
            }
            
            function submitQuestionnaire() {
                // In a real app, you would submit the formData to the server here
                console.log('Collected form data:', formData);
                
                // Hide all questions and show completion message
                document.querySelectorAll('.question').forEach(q => {
                    q.style.display = 'none';
                });
                
                // Show completion message
                completionMessage.style.display = 'block';
                
                // Hide navigation buttons
                document.querySelector('.navigation').style.display = 'none';
                
                // Update progress to 100%
                progressBar.style.width = '100%';
                progressPercentage.textContent = '100%';
            }
        });